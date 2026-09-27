import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ChainSyncCheckpoint } from './entities/chain-sync-checkpoint.entity';
import {
  ContractEvent,
  ContractEventStatus,
} from './entities/contract-event.entity';
import { ReorgEvent } from './entities/reorg-event.entity';
import { IndexerCheckpoint } from './entities/indexer-checkpoint.entity';
import { CHECKPOINT_LEDGER_KEY } from './indexer.service';

const DEFAULT_RECONCILE_INTERVAL_MS = 60_000;
const DEFAULT_RECONCILE_WINDOW = 200;
const BACKFILL_BATCH_SIZE = 100;
const DEFAULT_REORG_ROLLBACK_DEPTH = 10;

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private lastBackfillCount = 0;

  constructor(
    private readonly configService: ConfigService,

    @InjectRepository(ChainSyncCheckpoint)
    private readonly checkpointRepository: Repository<ChainSyncCheckpoint>,

    @InjectRepository(ContractEvent)
    private readonly contractEventRepository: Repository<ContractEvent>,

    @InjectRepository(ReorgEvent)
    private readonly reorgEventRepository: Repository<ReorgEvent>,

    @InjectRepository(IndexerCheckpoint)
    private readonly indexerCheckpointRepository: Repository<IndexerCheckpoint>,
  ) {}

  @Cron('*/60 * * * * *')
  async reconcile(): Promise<void> {
    if (!this.isEnabled()) return;

    const contractIds = this.getReconciledContractIds();
    if (contractIds.length === 0) return;

    if (this.isRunning) {
      this.logger.warn('Reconciliation skipped: previous run still active');
      return;
    }

    this.isRunning = true;
    try {
      for (const contractId of contractIds) {
        await this.runReconciliation(contractId);
      }
    } catch (error) {
      this.logger.error('Reconciliation failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Contracts covered by the reconciliation backfill sweep. Includes the
   * primary savings-vault contract plus the yield-adapter contract so that a
   * gap or restart cannot leave yield-adapter events unindexed.
   */
  private getReconciledContractIds(): string[] {
    const candidates = [
      this.configService.get<string>('SOROBAN_CONTRACT_ID'),
      this.configService.get<string>('YIELD_ADAPTER_CONTRACT_ID'),
    ];

    return candidates.filter(
      (id): id is string =>
        typeof id === 'string' && id.length > 0 && id !== 'your-contract-id-here',
    );
  }

  private async runReconciliation(contractId: string): Promise<void> {
    const checkpoint = await this.getOrCreateCheckpoint(contractId);

    const rpcUrl = this.configService.get<string>('SOROBAN_RPC_URL');
    if (!rpcUrl) {
      this.logger.warn(
        'SOROBAN_RPC_URL not configured; skipping reconciliation',
      );
      return;
    }

    await this.detectAndHandleReorg(contractId, checkpoint, rpcUrl);

    const chainHead = await this.fetchChainHead(rpcUrl, contractId);
    if (chainHead === null) return;

    checkpoint.chain_head_ledger = chainHead;

    const lastIndexed = Number(checkpoint.last_indexed_ledger);
    if (lastIndexed >= chainHead) {
      checkpoint.last_indexed_ledger_hash =
        (await this.fetchLedgerHash(rpcUrl, lastIndexed)) ??
        checkpoint.last_indexed_ledger_hash;
      await this.checkpointRepository.save(checkpoint);
      this.lastRunAt = new Date();
      return;
    }

    const window = this.getReconcileWindow();
    const fromLedger = Math.max(lastIndexed + 1, 1);
    const toLedger = Math.min(fromLedger + window - 1, chainHead);

    const backfilledCount = await this.backfillGap(
      rpcUrl,
      contractId,
      fromLedger,
      toLedger,
    );

    checkpoint.last_reconciled_from = fromLedger;
    checkpoint.last_reconciled_to = toLedger;
    checkpoint.last_reconciled_at = new Date();
    checkpoint.last_backfill_count = backfilledCount;

    if (backfilledCount >= 0) {
      checkpoint.last_indexed_ledger = toLedger;
    }

    checkpoint.last_indexed_ledger_hash =
      (await this.fetchLedgerHash(rpcUrl, checkpoint.last_indexed_ledger)) ??
      checkpoint.last_indexed_ledger_hash;

    await this.checkpointRepository.save(checkpoint);
    this.lastRunAt = new Date();
    this.lastBackfillCount = backfilledCount;

    if (backfilledCount > 0) {
      this.logger.log(
        `Reconciliation backfilled ${backfilledCount} events for ${contractId} (ledgers ${fromLedger}–${toLedger})`,
      );
    }
  }

  private async backfillGap(
    rpcUrl: string,
    contractId: string,
    fromLedger: number,
    toLedger: number,
  ): Promise<number> {
    let backfilled = 0;

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'insightarena-reconciliation',
          method: 'getEvents',
          params: {
            startLedger: fromLedger,
            filters: [{ type: 'contract', contractIds: [contractId] }],
            xdrFormat: 'json',
            limit: BACKFILL_BATCH_SIZE,
          },
        }),
      });

      if (!response.ok) {
        this.logger.error(`Reconciliation RPC error: HTTP ${response.status}`);
        return 0;
      }

      const body = (await response.json()) as {
        error?: { message?: string };
        result?: { events?: unknown[]; latestLedger?: number };
      };

      if (body.error) {
        this.logger.error(
          `Reconciliation RPC error: ${body.error.message ?? 'Unknown'}`,
        );
        return 0;
      }

      const rawEvents = body.result?.events ?? [];

      for (const raw of rawEvents) {
        if (!raw || typeof raw !== 'object') continue;
        const record = raw as Record<string, unknown>;
        const ledger = typeof record.ledger === 'number' ? record.ledger : null;
        if (ledger === null || ledger > toLedger) continue;

        const logIndex =
          typeof record.log_index === 'number' ? record.log_index : 0;

        const existing = await this.contractEventRepository.findOne({
          where: { ledger, log_index: logIndex },
        });

        if (existing) continue;

        const eventType = this.extractEventType(record);
        const txHash =
          typeof record.tx_hash === 'string' ? record.tx_hash : null;
        const data =
          record.value && typeof record.value === 'object'
            ? (record.value as Record<string, unknown>)
            : ((record.data as Record<string, unknown>) ?? {});

        const contractEvent = this.contractEventRepository.create({
          ledger,
          log_index: logIndex,
          event_type: eventType || 'unknown',
          data,
          tx_hash: txHash,
          status: ContractEventStatus.PENDING,
          retry_count: 0,
        });

        await this.contractEventRepository.save(contractEvent);
        backfilled++;
      }
    } catch (error) {
      this.logger.error('Backfill fetch failed', error);
    }

    return backfilled;
  }

  private extractEventType(record: Record<string, unknown>): string | null {
    if (typeof record.type === 'string') return record.type;

    const value = record.value as Record<string, unknown> | undefined;
    if (value && typeof value.event === 'string') return value.event;
    if (value && typeof value.event_type === 'string') return value.event_type;

    return null;
  }

  private async fetchChainHead(
    rpcUrl: string,
    contractId: string,
  ): Promise<number | null> {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'insightarena-reconciliation-head',
          method: 'getEvents',
          params: {
            startLedger: 1,
            filters: [{ type: 'contract', contractIds: [contractId] }],
            limit: 1,
          },
        }),
      });

      if (!response.ok) return null;

      const body = (await response.json()) as {
        result?: { latestLedger?: number };
      };

      return typeof body.result?.latestLedger === 'number'
        ? body.result.latestLedger
        : null;
    } catch {
      this.logger.error('Failed to fetch chain head');
      return null;
    }
  }

  private async fetchLedger

/* … truncated 5957 chars — edit only what you need near the top … */
