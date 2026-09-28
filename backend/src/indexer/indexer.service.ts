import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import {
  ContractEvent,
  ContractEventStatus,
} from './entities/contract-event.entity';
import { FeeHistory } from './entities/fee-history.entity';
import { IndexerCheckpoint } from './entities/indexer-checkpoint.entity';
import { IndexerMetricsDto } from './dto/indexer-metrics.dto';
import { BackfillResponseDto } from './dto/backfill.dto';
import { ReconciliationService } from './reconciliation.service';
import { SorobanService } from '../soroban/soroban.service';
import { SavingsProjectionService } from '../savings-projection/savings-projection.service';

export const CHECKPOINT_LEDGER_KEY = 'indexer:last_processed_ledger';
const CHECKPOINT_LEDGER_KEY_LATEST = 'indexer:latest_contract_ledger';
const MAX_RETRIES = 5;
const BATCH_SIZE = 100;
const BACKFILL_MAX_PAGES = 1000;

/**
 * Topic emitted by the yield-adapter when a pending withdrawal is claimed.
 */
export const WITHDRAW_CLAIMED_TOPIC = 'withdraw_claimed';

/**
 * Indexes on-chain events emitted by the Stow savings-vault contract into the
 * `contract_events` store, applies them to the savings projections via
 * `SavingsProjectionService`, and exposes read/replay/metrics APIs.
 */
@Injectable()
export class IndexerService implements OnModuleInit {
  private readonly logger = new Logger(IndexerService.name);
  private isRunning = false;
  private startTime: number = Date.now();
  private eventsProcessed = 0;
  private depositsProcessed = 0;
  private withdrawalsProcessed = 0;
  private lastProcessedAt = Date.now();
  private eventTimestamps: number[] = [];

  /**
   * Pending withdrawals keyed by their on-chain withdrawal id. A record is
   * removed once the matching `withdraw_claimed` event is decoded.
   */
  private readonly pendingWithdrawals = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ContractEvent)
    private readonly contractEventRepository: Repository<ContractEvent>,
    @InjectRepository(FeeHistory)
    private readonly feeHistoryRepository: Repository<FeeHistory>,
    @InjectRepository(IndexerCheckpoint)
    private readonly checkpointRepository: Repository<IndexerCheckpoint>,
    private readonly reconciliationService: ReconciliationService,
    private readonly sorobanService: SorobanService,
    private readonly savingsProjectionService: SavingsProjectionService,
  ) {}

  async onModuleInit(): Promise<void> {
    const last = await this.getCheckpoint(CHECKPOINT_LEDGER_KEY);
    this.logger.log(`Indexer initialized at ledger ${last}`);
  }

  // --- polling ------------------------------------------------------------

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollContractEvents(): Promise<void> {
    const contractId = this.configService.get<string>('SOROBAN_CONTRACT_ID');
    if (!contractId || contractId === 'your-contract-id-here') {
      return; // Skip until the savings-vault contract is deployed.
    }
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await this.fetchAndPersistEvents();
      await this.processPendingBatch();
    } catch (err) {
      this.logger.error('pollContractEvents failed', err as Error);
    } finally {
      this.isRunning = false;
    }
  }

  async fetchAndPersistEvents(): Promise<number> {
    const lastProcessed = await this.getCheckpoint(CHECKPOINT_LEDGER_KEY);
    const startLedger = lastProcessed > 0 ? lastProcessed + 1 : 1;

    const { events, latestLedger } =
      await this.sorobanService.getEvents(startLedger);

    const safeLatestLedger =
      typeof latestLedger === 'number' ? latestLedger : lastProcessed;
    if (safeLatestLedger > 0) {
      await this.setCheckpoint(CHECKPOINT_LEDGER_KEY_LATEST, safeLatestLedger);
    }

    let persistedCount = 0;
    let maxEventLedger = lastProcessed;

    for (let index = 0; index < events.length; index++) {
      const rpcEvent = events[index];
      const logIndex = index;

      const existing = await this.contractEventRepository.findOne({
        where: { ledger: rpcEvent.ledger, log_index: logIndex },
      });

      if (!existing) {
        const eventType =
          rpcEvent.topic && rpcEvent.topic.length > 0
            ? rpcEvent.topic[0]
            : 'unknown';

        const contractEvent = this.contractEventRepository.create({
          ledger: rpcEvent.ledger,
          log_index: logIndex,
          event_type: eventType,
          data: rpcEvent.value,
          tx_hash: rpcEvent.txHash ?? null,
          status: ContractEventStatus.PENDING,
          retry_count: 0,
        });

        await this.contractEventRepository.save(contractEvent);
        persistedCount++;
      }

      if (rpcEvent.ledger > maxEventLedger) {
        maxEventLedger = rpcEvent.ledger;
      }
    }

    const newCheckpoint =
      events.length > 0
        ? Math.max(maxEventLedger, safeLatestLedger)
        : Math.max(lastProcessed, safeLatestLedger);

    if (newCheckpoint > lastProcessed) {
      await this.setCheckpoint(CHECKPOINT_LEDGER_KEY, newCheckpoint);
    }

    return persistedCount;
  }

  private async processPendingBatch(): Promise<void> {
    const pending = await this.contractEventRepository.find({
      where: { status: ContractEventStatus.PENDING },
      order: { ledger: 'ASC' },
      take: BATCH_SIZE,
    });
    for (const event of pending) {
      await this.applyEvent(event);
    }
  }

  private async applyEvent(event: ContractEvent): Promise<void> {
    try {
      await this.decodeAndApply(event);
      event.status = ContractEventStatus.PROCESSED;
      await this.contractEventRepository.save(event);
      this.recordProcessed(event.event_type);
    } catch (err) {
      event.retry_count = (event.retry_count ?? 0) + 1;
      event.status =
        event.retry_count >= MAX_RETRIES
          ? ContractEventStatus.DLQ
          : ContractEventStatus.FAILED;
      await this.contractEventRepository.save(event);
      this.logger.warn(`Event ${event.id} failed: ${(err as Error).message}`);
    }
  }

  /**
   * Decode a savings-vault event and apply its side effects (update savings
   * balances, mark goals reached, record group settlements, etc.) via the
   * shared savings-projection service.
   */
  private async decodeAndApply(event: ContractEvent): Promise<void> {
    if (event.event_type === WITHDRAW_CLAIMED_TOPIC) {
      this.decodeWithdrawClaimed(event.data ?? {});
      return;
    }

    await this.savingsProjectionService.apply(
      event.event_type,
      event.data ?? {},
    );
  }

  /**
   * Decode a yield-adapter `withdraw_claimed` event and resolve the matching
   * pending-withdrawal record so it no longer shows as pending.
   */
  private decodeWithdrawClaimed(data: Record<string, unknown>): void {
    const withdrawalId = this.extractWithdrawalId(data);
    if (withdrawalId === null) {
      this.logger.warn('withdraw_claimed event missing withdrawal id');
      return;
    }

    const resolved = this.pendingWithdrawals.delete(withdrawalId);
    if (resolved) {
      this.withdrawalsProcessed++;
      this.logger.log(`Resolved pending withdrawal ${withdrawalId}`);
    } else {
      this.logger.warn(
        `withdraw_claimed for unknown withdrawal ${withdrawalId}`,
      );
    }
  }

  /**
   * Extract the withdrawal id from a decoded event payload, tolerating the
   * common field names used by the yield-adapter contract.
   */
  private extractWithdrawalId(data: Record<string, unknown>): string | null {
    const candidate =
      data.withdrawal_id ??
      data.withdrawalId ??
      data.id ??
      data.request_id ??
      data.requestId;

    if (candidate === undefined || candidate === null) {
      return null;
    }
    return String(candidate);
  }

  /**
   * Register a pending withdrawal so a later `withdraw_claimed` event can
   * resolve it. Exposed for the indexer pipeline and tests.
   */
  registerPendingWithdrawal(
    withdrawalId: string,
    record: Record<string, unknown> = {},
  ): void {
    this.pendingWithdrawals.set(withdrawalId, record);
  }

  /**
   * Whether a withdrawal is still awaiting its `withdraw_claimed` event.
   */
  isWithdrawalPending(withdrawalId: string): boolean {
    return this.pendingWithdrawals.has(withdrawalId);
  }

  // --- replay / maintenance ----------------------------------------------

  async reindex(fromLedger: number): Promise<void> {
    await this.setCheckpoint(CHECKPOINT_LEDGER_KEY, fromLedger);
    this.logger.log(`Reindex requested from ledger ${fromLedger}`);
  }

  async triggerManualSync(): Promise<void> {
    await this.pollContractEvents();
  }

  async backfillEvents(
    fromLedger: number,
    toLedger: number,
  ): Promise<BackfillResponseDto> {
    this.logger.log(`Backfill requested ${fromLedger}..${toLedger}`);
    let totalFetched = 0;
    let newlyProcessed = 0;
    let alreadyIndexed = 0;
    let errors = 0;

    try {
      let cursor = fromLedger;
      let pages = 0;

      while (cursor <= toLedger && pages < BACKFILL_MAX_PAGES) {
        pages++;

        const { events } = await this.sorobanService.getEvents(cursor);
        if (events.length === 0) break;

        const inRangeEvents = events.filter(
          (e) => e.ledger >= fromLedger && e.ledger <= toLedger,
        );
        totalFetched += inRangeEvents.length;

        for (let index = 0; index < inRangeEvents.length; index++) {
          const rpcEvent = inRangeEvents[index];
          const logIndex = index;

          const existing = await this.contractEventRepository.findOne({
            where: { ledger: rpcEvent.ledger, log_index: logIndex },
          });

          if (existing) {
            alreadyIndexed++;
          } else {
            try {
              const eventType =
                rpcEvent.topic && rpcEvent.topic.length > 0
                  ? rpcEvent.topic[0]
                  : 'unknown';

              const contractEvent = this.contractEventRepository.create({
                ledger: rpcEvent.ledger,
                log_index: logIndex,
                event_type: eventType,
                data: rpcEvent.value,
                tx_hash: rpcEvent.txHash ?? null,
                status: ContractEventStatus.PENDING,
                retry_count: 0,
              });

              await this.contractEventRepository.save(contractEvent);
              newlyProcessed++;
            } catch (err) {
              errors++;
              this.logger.warn(
                `Backfill failed for ledger ${rpcEvent.ledger}: ${(err as Error).message}`,
              );
            }
          }
        }

        cursor = inRangeEvents.length > 0
          ? Math.max(...inRangeEvents.map((e) => e.ledger)) + 1
          : toLedger + 1;
      }
    } catch (err) {
      errors++;
      this.logger.error('backfillEvents failed', err as Error);
    }

    return {
      fromLedger,
      toLedger,
      totalFetched,
      newlyProcessed,
      alreadyIndexed,
      errors,
    } as BackfillResponseDto;
  }

  // --- read APIs ----------------------------------------------------------

  async getEvents(
    status?: ContractEventStatus,
    limit = BATCH_SIZE,
  ): Promise<ContractEvent[]> {
    return this.contractEventRepository.find({
      where: status ? { status } : {},
      order: { ledger: 'DESC' },
      take: limit,
    });
  }

  async getMetrics(): Promise<IndexerMetricsDto> {
    const now = Date.now();
    this.eventTimestamps = this.eventTimestamps.filter((t) => now - t < 60_000);
    const eventsPerMinute = this.eventTimestamps.length;

    return {
      eventsProcessed: this.eventsProcessed,
      depositsProcessed: this.depositsProcessed,
      withdrawalsProcessed: this.withdrawalsProcessed,
      eventsPerMinute,
      lastProcessedAt: new Date(this.lastProcessedAt).toISOString(),
      uptimeSeconds: Math.floor((now - this.startTime) / 1000),
    } as IndexerMetricsDto;
  }

  private recordProcessed(eventType: string): void {
    this.eventsProcessed++;
    this.lastProcessedAt = Date.now();
    this.eventTimestamps.push(this.lastProcessedAt);

    if (eventType === 'deposit') {
      this.depositsProcessed++;
    } else if (eventType === 'withdraw') {
      this.withdrawalsProcessed++;
    }
  }

  // --- checkpoints --------------------------------------------------------

  private async getCheckpoint(key: string): Promise<number> {
    const record = await this.checkpointRepository.findOne({ where: { key } });
    return record ? Number(record.value) : 0;
  }

  private async setCheckpoint(key: string, value: number): Promise<void> {
    let record = await this.checkpointRepository.findOne({ where: { key } });
    if (!record) {
      record = this.checkpointRepository.create({ key, value: String(value) });
    } else {
      record.value = String(value);
    }
    await this.checkpointRepository.save(record);
  }
}
