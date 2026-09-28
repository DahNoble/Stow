import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from './entities/balance.entity';

export interface BalanceView {
  account: string;
  amount: string;
}

export interface AccountBalanceView {
  account: string;
  amount: string;
  created_at: Date;
  updated_at: Date;
}

/** A single harvest observation used to derive the trailing-window APR. */
export interface HarvestRecord {
  /** Exchange rate (scaled integer, as a string) observed at `timestamp`. */
  rate: string;
  /** When the harvest was recorded. */
  timestamp: Date;
}

/** Response shape for `GET /savings/yield/rate`. */
export interface YieldRateView {
  /** Current exchange rate (scaled integer, as a string). */
  rate: string;
  /** Trailing-window APR as a decimal fraction (e.g. `0.05` = 5%), or `null` when it cannot be derived. */
  apr: number | null;
  /** Length of the trailing window, in days, used for the APR. */
  window_days: number;
}

/** TTL for balance reads: 10 seconds */
const BALANCE_CACHE_TTL_MS = 10_000;

/** Trailing window (in days) over which the APR is computed. */
export const APR_WINDOW_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const cacheKey = (account: string) => `savings:balance:${account}`;

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /** Credits `amount` stroops onto the account's running balance and invalidates cache. */
  async credit(account: string, amount: string): Promise<Balance> {
    let balance = await this.balanceRepository.findOne({
      where: { account },
    });
    if (!balance) {
      balance = this.balanceRepository.create({ account, amount: '0' });
    }
    balance.amount = (BigInt(balance.amount) + BigInt(amount)).toString();
    const saved = await this.balanceRepository.save(balance);
    await this.cache.del(cacheKey(account));
    return saved;
  }

  /**
   * Sets the account's balance to an absolute value and invalidates cache.
   *
   * Used for the `withdraw` projection instead of a `debit`-by-delta
   * method: the on-chain `withdraw` event already carries the contract's
   * own post-withdrawal balance (`new_balance`), so setting to that value
   * directly is idempotent by construction — replaying the same event
   * twice converges to the same final balance both times, unlike
   * decrementing by the withdrawn amount, which would double-apply on
   * redelivery. Mirrors `LockedPlansService.upsertCreated`'s
   * set-absolute-state approach for the same reason.
   */
  async setBalance(account: string, amount: string): Promise<Balance> {
    let balance = await this.balanceRepository.findOne({
      where: { account },
    });
    if (!balance) {
      balance = this.balanceRepository.create({ account, amount: '0' });
    }
    balance.amount = amount;
    const saved = await this.balanceRepository.save(balance);
    await this.cache.del(cacheKey(account));
    return saved;
  }

  async get(account: string): Promise<BalanceView> {
    const key = cacheKey(account);
    const cached = await this.cache.get<BalanceView>(key);
    if (cached) return cached;

    const balance = await this.balanceRepository.findOne({
      where: { account },
    });
    const view: BalanceView = { account, amount: balance?.amount ?? '0' };
    await this.cache.set(key, view, BALANCE_CACHE_TTL_MS);
    return view;
  }

  /**
   * Fetches the projected flexible balance for `account`, or `null` if no
   * account has ever been observed (i.e. no `deposit` event has ever been
   * recorded for it) — distinct from `get()`, which defaults an unknown
   * account to a zero balance for internal callers that don't need to
   * distinguish "zero balance" from "never existed".
   */
  async findAccount(account: string): Promise<AccountBalanceView | null> {
    const balance = await this.balanceRepository.findOne({
      where: { account },
    });
    if (!balance) return null;

    return {
      account: balance.account,
      amount: balance.amount,
      created_at: balance.created_at,
      updated_at: balance.updated_at,
    };
  }

  /**
   * Derives the trailing-window APR from a harvest history.
   *
   * The exchange rate grows monotonically as yield accrues, so the APR is
   * the annualised simple growth rate between the oldest harvest inside the
   * trailing window and the most recent one:
   *
   *   apr = (latestRate / oldestRate - 1) * (365 / elapsedDays)
   *
   * Returns `null` when the APR cannot be derived — fewer than two harvests,
   * a non-positive/zero oldest rate, or a non-positive elapsed time.
   */
  computeApr(
    history: HarvestRecord[],
    windowDays: number = APR_WINDOW_DAYS,
    now: Date = new Date(),
  ): number | null {
    if (!history || history.length < 2) return null;

    const windowStart = now.getTime() - windowDays * MS_PER_DAY;
    const inWindow = history
      .filter((h) => h.timestamp.getTime() >= windowStart)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (inWindow.length < 2) return null;

    const oldest = inWindow[0];
    const latest = inWindow[inWindow.length - 1];

    const oldestRate = BigInt(oldest.rate);
    const latestRate = BigInt(latest.rate);
    if (oldestRate <= 0n) return null;

    const elapsedMs = latest.timestamp.getTime() - oldest.timestamp.getTime();
    if (elapsedMs <= 0) return null;

    const elapsedDays = elapsedMs / MS_PER_DAY;
    const growth = Number(latestRate) / Number(oldestRate) - 1;
    return growth * (365 / elapsedDays);
  }

  /**
   * Builds the `GET /savings/yield/rate` view: the current exchange rate
   * plus the trailing-window APR derived from `history`.
   */
  buildYieldRateView(
    currentRate: string,
    history: HarvestRecord[],
    windowDays: number = APR_WINDOW_DAYS,
    now: Date = new Date(),
  ): YieldRateView {
    return {
      rate: currentRate,
      apr: this.computeApr(history, windowDays, now),
      window_days: windowDays,
    };
  }
}
