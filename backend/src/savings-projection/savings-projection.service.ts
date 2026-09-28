import { Injectable, Logger } from '@nestjs/common';
import { GoalsService } from '../goals/goals.service';
import { BalanceService } from '../savings/balance.service';
import { GroupsService } from '../savings/groups.service';
import { LockedPlansService } from '../savings/locked-plans.service';
import { NotificationGeneratorService } from '../notifications/notification-generator.service';
import { SavingsService } from '../savings/savings.service';

/**
 * Applies a single savings-vault contract event to the off-chain
 * projections (goals, balances, groups, locked plans). Shared by the
 * indexer's event-store pipeline and the Soroban listener's live poll loop
 * so both dispatch on `topic[0]` the same way.
 *
 * Every handler here is idempotent on its own terms (upsert-by-on-chain-id,
 * or a status/settled flag guarding the state change); callers are
 * responsible for not re-delivering the same event once it has been
 * durably checkpointed.
 */
@Injectable()
export class SavingsProjectionService {
  private readonly logger = new Logger(SavingsProjectionService.name);

  constructor(
    private readonly goalsService: GoalsService,
    private readonly balanceService: BalanceService,
    private readonly groupsService: GroupsService,
    private readonly lockedPlansService: LockedPlansService,
    private readonly notificationGeneratorService: NotificationGeneratorService,
    private readonly savingsService: SavingsService,
  ) {}

  async apply(topic: string, data: Record<string, unknown>): Promise<void> {
    switch (topic) {
      case 'goal_created': {
        await this.goalsService.upsertCreated({
          onChainId: String(data.id ?? data.goal_id),
          owner: String(data.owner),
          name: typeof data.name === 'string' ? data.name : '',
          targetAmount: String(data.target_amount),
        });
        break;
      }

      case 'goal_contribution': {
        const goal = await this.goalsService.applyContribution(
          String(data.id ?? data.goal_id),
          String(data.amount),
        );
        if (BigInt(goal.current_amount) >= BigInt(goal.target_amount)) {
          await this.markGoalReachedAndNotify(goal.on_chain_id);
        }
        break;
      }

      case 'goal_reached': {
        await this.markGoalReachedAndNotify(String(data.id ?? data.goal_id));
        break;
      }

      case 'locked_created': {
        await this.lockedPlansService.upsertCreated({
          onChainId: String(data.id ?? data.plan_id),
          owner: String(data.owner),
          balance: String(data.amount),
          unlockAt: this.toDate(data.unlock_at),
        });
        break;
      }

      case 'deposit': {
        const account = data.owner ?? data.user ?? data.account;
        await this.balanceService.credit(String(account), String(data.amount));
        break;
      }

      case 'withdraw': {
        // Set to the contract's own post-withdrawal balance rather than
        // decrementing by the withdrawn amount — see BalanceService.setBalance
        // for why this is what makes replaying the same event idempotent.
        const account = data.owner ?? data.user ?? data.account;
        await this.balanceService.setBalance(
          String(account),
          String(data.new_balance),
        );
        break;
      }

      case 'group_split_settled': {
        const { changed } = await this.groupsService.markSettled(
          String(data.id ?? data.group_id),
        );
        if (changed) {
          await this.notificationGeneratorService.handleGroupSettled(data);
        }
        break;
      }

      case 'strategy_changed': {
        // Decode yield-adapter strategy_changed event:
        // - Activation: from is null, to is set
        // - Migration: from and to are both set
        // - Emergency clear: from is set, to is null
        const from = data.from ? Number(data.from) : null;
        const to = data.to ? Number(data.to) : null;

        // Log for admin/ops historical tracking; no side effects needed
        if (from === null && to !== null) {
          this.logger.log(`Strategy activation: strategy_id=${to}`);
        } else if (from !== null && to !== null) {
          this.logger.log(`Strategy migration: from=${from} to=${to}`);
        } else if (from !== null && to === null) {
          this.logger.log(
            `Strategy emergency clear: cleared strategy_id=${from}`,
          );
        }
        break;
      }

      case 'deposited': {
        // Handle yield-adapter deposited event per contracts/yield-adapter/README.md:
        // Topics: (Symbol("deposited"), owner: Address)
        // Data: [owner, amount, shares_minted, position_shares, total_shares, timestamp]
        const owner = String(data.owner ?? '');
        const shares = String(data.position_shares ?? data.total_shares ?? '0');
        const exchangeRate = data.total_shares && data.total_assets
          ? this.calculateExchangeRate(
              String(data.total_assets),
              String(data.total_shares),
            )
          : undefined;

        if (owner && shares) {
          await this.savingsService.upsertYieldPosition(owner, shares, exchangeRate);
          this.logger.log(`Yield deposited: owner=${owner}, shares=${shares}`);
        }
        break;
      }

      case 'harvested': {
        // Handle yield-adapter harvested event:
        // Topics: (Symbol("harvested"),)
        // Data: [caller, strategy_id, delta, fee, total_assets, total_shares, timestamp]
        // The harvested event updates the exchange rate for all positions
        // Invalidate the yield rate cache so the next request fetches fresh data
        await this.savingsService.invalidateYieldRateCache();
        this.logger.log(
          `Yield harvested: strategy=${data.strategy_id}, delta=${data.delta}, fee=${data.fee} — cache invalidated`,
        );
        break;
      }

      default:
        this.logger.debug(`No projection handler for topic "${topic}"`);
        break;
    }
  }

  private async markGoalReachedAndNotify(onChainId: string): Promise<void> {
    const { goal, changed } = await this.goalsService.markReached(onChainId);
    if (!changed) return;
    await this.notificationGeneratorService.handleGoalReached({
      goalId: goal.on_chain_id,
      owner: goal.owner,
      name: goal.name,
      targetAmount: goal.target_amount,
    });
  }

  /**
   * Converts a contract event's `unlock_at` field — a Soroban `u64` ledger
   * timestamp in whole seconds since the Unix epoch, decoded as a JS
   * `number`, `string`, or `bigint` depending on the XDR normalization step
   * upstream — into a `Date` for the `locked_plans` projection.
   */
  private toDate(value: unknown): Date {
    const seconds =
      typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
    return new Date(seconds * 1000);
  }

  /**
   * Calculates the exchange rate from total assets and total shares.
   * Returns the rate as a scaled integer string (assets/shares * 1e7 for precision).
   */
  private calculateExchangeRate(totalAssets: string, totalShares: string): string {
    try {
      const assets = BigInt(totalAssets);
      const shares = BigInt(totalShares);
      if (shares === 0n) return '0';
      // Calculate rate with 7 decimal places of precision
      const rate = (assets * 10_000_000n) / shares;
      return rate.toString();
    } catch {
      return '0';
    }
  }
}
