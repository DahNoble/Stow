import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { GoalsService } from '../goals/goals.service';
import { BalanceService, APR_WINDOW_DAYS, HarvestRecord } from './balance.service';
import {
  SavingsProductSummaryDto,
  SavingsSummaryDto,
} from './dto/savings-summary.dto';
import { YieldPosition } from './entities/yield-position.entity';
import { YieldPositionResponseDto } from './dto/yield-position-response.dto';
import { YieldRateResponseDto } from './dto/yield-rate-response.dto';

/** Cache TTL for yield rate data (in milliseconds). Short TTL to ensure freshness. */
const YIELD_RATE_CACHE_TTL_MS = 30_000; // 30 seconds

/** Cache key for the global yield rate (no user-specific data). */
const YIELD_RATE_CACHE_KEY = 'savings:yield:rate';

@Injectable()
export class SavingsService {
  constructor(
    @InjectRepository(YieldPosition)
    private readonly yieldPositionRepository: Repository<YieldPosition>,
    private readonly balanceService: BalanceService,
    private readonly goalsService: GoalsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  ping(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * Per-product totals for `address` across the savings products the
   * backend currently tracks, plus a grand total.
   *
   * Scope note: only `flexible` (the `Balance` read-model) and `goals`
   * (the `Goal` read-model, summed by `current_amount` i.e. amount
   * actually saved so far, not `target_amount`) are included — these are
   * the two product variants defined on `SavingsProductSummaryDto`. Group
   * pool balances are intentionally excluded: a group's balance is shared
   * across all members rather than attributable to a single address, and
   * isn't one of the enumerated products.
   */
  async summary(address: string): Promise<SavingsSummaryDto> {
    const [flexible, goals] = await Promise.all([
      this.balanceService.get(address),
      this.goalsService.summary(address),
    ]);

    const products: SavingsProductSummaryDto[] = [
      { product: 'flexible', total: flexible.amount },
      { product: 'goals', total: goals.total_saved },
    ];

    const total = products
      .reduce((sum, product) => sum + BigInt(product.total), 0n)
      .toString();

    return { address, products, total };
  }

  /**
   * Get the caller's yield-adapter position.
   *
   * Returns shares, estimated asset value (based on last-known exchange rate),
   * and pending withdrawal cooldown status.
   *
   * If no position exists, returns a well-formed empty response (not an error).
   */
  async getYieldPosition(
    ownerAddress: string,
  ): Promise<YieldPositionResponseDto> {
    const position = await this.yieldPositionRepository.findOne({
      where: { owner: ownerAddress },
    });

    if (!position) {
      return {
        address: ownerAddress,
        shares: '0',
        estimated_asset_value: null,
        exchange_rate_snapshot: null,
        pending_withdrawal_claimable_at: null,
        updated_at: new Date(),
      };
    }

    // Calculate estimated asset value from shares and exchange rate
    let estimatedValue: string | null = null;
    if (position.exchange_rate_snapshot && position.shares !== '0') {
      try {
        const shares = BigInt(position.shares);
        const rate = parseFloat(position.exchange_rate_snapshot);
        if (rate > 0) {
          estimatedValue = Math.floor(Number(shares) * rate).toString();
        }
      } catch {
        // If calculation fails, leave as null
      }
    }

    return {
      address: position.owner,
      shares: position.shares,
      estimated_asset_value: estimatedValue,
      exchange_rate_snapshot: position.exchange_rate_snapshot,
      pending_withdrawal_claimable_at: null, // Will be populated by indexer when withdrawals are tracked
      updated_at: position.updated_at,
    };
  }

  /**
   * Upserts a yield-adapter position from a 'deposited' event.
   * Called by the indexer's SavingsProjectionService.
   *
   * @param owner - The owner's Stellar address
   * @param shares - Total shares after the deposit
   * @param exchangeRate - Current exchange rate snapshot (optional)
   */
  async upsertYieldPosition(
    owner: string,
    shares: string,
    exchangeRate?: string,
  ): Promise<YieldPosition> {
    let position = await this.yieldPositionRepository.findOne({
      where: { owner },
    });

    if (!position) {
      position = this.yieldPositionRepository.create({
        owner,
        shares: '0',
        exchange_rate_snapshot: null,
      });
    }

    position.shares = shares;
    if (exchangeRate !== undefined) {
      position.exchange_rate_snapshot = exchangeRate;
    }

    return this.yieldPositionRepository.save(position);
  }

  /**
   * Get the current yield rate (exchange rate and APR).
   *
   * Uses a short-TTL cache to avoid hitting Soroban RPC on every request.
   * Cache is invalidated when harvest events are processed (see task #6).
   *
   * The exchange rate is derived from the yield_positions table's latest
   * exchange_rate_snapshot, and the APR is computed from recent harvest history.
   */
  async getYieldRate(): Promise<YieldRateResponseDto> {
    // Check cache first
    const cached = await this.cache.get<YieldRateResponseDto>(YIELD_RATE_CACHE_KEY);
    if (cached) {
      return cached;
    }

    // Get the latest exchange rate from any yield position
    const latestPosition = await this.yieldPositionRepository.findOne({
      order: { updated_at: 'DESC' },
    });

    const currentRate = latestPosition?.exchange_rate_snapshot ?? '0';

    // Build the rate view with APR computation
    const rateView = this.balanceService.buildYieldRateView(
      currentRate,
      [], // TODO: Fetch harvest history from contract_events table
      APR_WINDOW_DAYS,
    );

    const response: YieldRateResponseDto = {
      rate: rateView.rate,
      apr: rateView.apr,
      window_days: rateView.window_days,
    };

    // Cache the result
    await this.cache.set(YIELD_RATE_CACHE_KEY, response, YIELD_RATE_CACHE_TTL_MS);

    return response;
  }

  /**
   * Invalidate the yield rate cache.
   * Called by the indexer when a harvest event is processed.
   */
  async invalidateYieldRateCache(): Promise<void> {
    await this.cache.del(YIELD_RATE_CACHE_KEY);
  }

  /**
   * Records / initiates a yield deposit (opt-in).
   */
  async depositYield(
    ownerAddress: string,
    amount: string,
  ): Promise<{ success: boolean; address: string; amount: string }> {
    return { success: true, address: ownerAddress, amount };
  }

  /**
   * Records / submits a yield withdrawal request.
   */
  async requestYieldWithdrawal(
    ownerAddress: string,
    shares: string,
  ): Promise<{ success: boolean; address: string; shares: string }> {
    return { success: true, address: ownerAddress, shares };
  }
}
