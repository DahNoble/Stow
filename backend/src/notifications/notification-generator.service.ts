import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { User } from '../users/entities/user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';

/**
 * Turns domain events into user notifications.
 *
 * After the pivot from the prediction market, the old match/prediction/event
 * handlers were removed. Implement savings-domain handlers here, e.g.
 * goal reached, locked plan unlocked, group settled, deposit received.
 *
 * TODO(issue): one handler per savings-vault event topic.
 */
@Injectable()
export class NotificationGeneratorService {
  private readonly logger = new Logger(NotificationGeneratorService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserPreferences)
    private readonly userPreferencesRepository: Repository<UserPreferences>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * A savings goal reached its target.
   *
   * Delivery rules:
   * 1. Look up the owner's User row by Stellar address to obtain their UUID.
   *    If no account exists (e.g. address not yet registered) we fall back to
   *    address-only delivery so the notification is never silently dropped.
   * 2. When a UUID is found, check `UserPreferences.goal_reached_notifications`.
   *    If the user has opted out we skip creating the notification entirely.
   * 3. Pass the UUID to `NotificationsService.create` so quiet-hours and
   *    frequency (INSTANT / HOURLY / DAILY) preferences are respected.
   */
  async handleGoalReached(data: {
    goalId: string;
    owner: string;
    name: string;
    targetAmount: string;
  }): Promise<void> {
    // --- 1. Resolve the user UUID from their Stellar address ----------------
    const user = await this.userRepository.findOne({
      where: { stellar_address: data.owner },
    });

    // --- 2. Respect the goal_reached_notifications opt-out preference -------
    if (user) {
      const prefs = await this.userPreferencesRepository.findOne({
        where: { userId: user.id },
      });
      if (prefs && !prefs.goal_reached_notifications) {
        this.logger.debug(
          `handleGoalReached: user ${user.id} has opted out of goal_reached notifications; skipping`,
        );
        return;
      }
    }

    // --- 3. Create the notification, routing via user preferences when known -
    await this.notificationsService.create(
      data.owner,
      NotificationType.GoalReached,
      'Savings goal reached! 🎯',
      `Your goal "${data.name}" has reached its target of ${data.targetAmount} stroops. Well done!`,
      { goal_id: data.goalId, target_amount: data.targetAmount },
      user?.id,
    );

    this.logger.log(
      `handleGoalReached: notification created for owner=${data.owner} goal=${data.goalId}`,
    );
  }

  /**
   * A harvest credited yield to the pool's depositors.
   *
   * Triggered off the indexed `harvested` event. Each depositor is notified
   * only when the harvest produced a positive yield and they have opted in to
   * `yield_earned_notifications` (independent of other savings notifications).
   * The credited amount is proportioned to the depositor's share of the pool
   * at harvest time.
   */
  async handleHarvested(data: {
    poolId: string;
    totalYield: string;
    depositors: Array<{ address: string; share: number }>;
  }): Promise<void> {
    // --- 1. A loss (or zero) harvest yields no notification -----------------
    const totalYield = BigInt(data.totalYield);
    if (totalYield <= 0n) {
      this.logger.debug(
        `handleHarvested: pool ${data.poolId} produced no yield; skipping`,
      );
      return;
    }

    // --- 2. Notify each depositor, proportioned to their pool share ---------
    for (const depositor of data.depositors) {
      const user = await this.userRepository.findOne({
        where: { stellar_address: depositor.address },
      });

      // Respect the yield_earned_notifications opt-out preference.
      if (user) {
        const prefs = await this.userPreferencesRepository.findOne({
          where: { userId: user.id },
        });
        if (prefs && !prefs.yield_earned_notifications) {
          this.logger.debug(
            `handleHarvested: user ${user.id} has opted out of yield_earned notifications; skipping`,
          );
          continue;
        }
      }

      // Proportion the yield to the depositor's share at harvest time.
      const earned = (totalYield * BigInt(Math.round(depositor.share * 1e6))) / 1_000_000n;
      if (earned <= 0n) {
        continue;
      }

      await this.notificationsService.create(
        depositor.address,
        NotificationType.YieldEarned,
        'Yield earned! 🌱',
        `Your share of the harvest credited ${earned.toString()} stroops of yield.`,
        {
          pool_id: data.poolId,
          total_yield: data.totalYield,
          share: depositor.share,
          earned: earned.toString(),
        },
        user?.id,
      );

      this.logger.log(
        `handleHarvested: notification created for owner=${depositor.address} pool=${data.poolId}`,
      );
    }
  }

  /**
   * A queued withdrawal's cooldown elapsed and the funds are now claimable.
   *
   * Triggered off the indexed `withdraw_requested` records (or a scheduled
   * sweep over them). A request is only notified once its `claimable_at` has
   * passed. Idempotency is enforced by checking for an existing
   * WithdrawalReady notification carrying the same `request_id`, so repeated
   * sweeps never produce duplicate notifications for the same request.
   */
  async handleWithdrawalReady(data: {
    requestId: string;
    owner: string;
    amount: string;
    claimableAt: string | Date;
  }): Promise<void> {
    // --- 1. Only notify once the cooldown has actually elapsed --------------
    const claimableAt = new Date(data.claimableAt);
    if (Number.isNaN(claimableAt.getTime()) || claimableAt.getTime() > Date.now()) {
      this.logger.debug(
        `handleWithdrawalReady: request ${data.requestId} not yet claimable; skipping`,
      );
      return;
    }

    // --- 2. Idempotency: skip if we already notified for this request -------
    const existing = await this.notificationsRepository.findOne({
      where: {
        type: NotificationType.WithdrawalReady,
        data: { request_id: data.requestId } as any,
      },
    });
    if (existing) {
      this.logger.debug(
        `handleWithdrawalReady: request ${data.requestId} already notified; skipping`,
      );
      return;
    }

    // --- 3. Resolve the user UUID from their Stellar address ----------------
    const user = await this.userRepository.findOne({
      where: { stellar_address: data.owner },
    });

    // --- 4. Create the notification, routing via user preferences when known -
    await this.notificationsService.create(
      data.owner,
      NotificationType.WithdrawalReady,
      'Withdrawal ready to claim! 💸',
      `Your withdrawal of ${data.amount} stroops is now claimable. Come back and claim it.`,
      {
        request_id: data.requestId,
        amount: data.amount,
        claimable_at: claimableAt.toISOString(),
      },
      user?.id,
    );

    this.logger.log(
      `handleWithdrawalReady: notification created for owner=${data.owner} request=${data.requestId}`,
    );
  }

  /** A locked savings plan passed its unlock time. */
  async handleLockUnlocked(_data: Record<string, unknown>): Promise<void> {
    // TODO(issue): notify the owner their locked funds are now withdrawable.
    this.logger.debug('handleLockUnlocked: not yet implemented');
  }

  /**
   * A deposit was confirmed into a savings vault.
   *
   * Delivery rules:
   * 1. Resolve owner address from `data.owner ?? data.user ?? data.account`.
   * 2. Look up the owner's User row by Stellar address to obtain their UUID.
   * 3. When a UUID is found, check `UserPreferences.deposit_notifications`.
   *    If opted out, skip.
   * 4. Create the notification with type `NotificationType.Deposit`.
   */
  async handleDepositReceived(data: {
    owner?: string;
    user?: string;
    account?: string;
    amount: string;
    asset?: string;
    transactionHash?: string;
    [key: string]: unknown;
  }): Promise<void> {
    const owner = data.owner ?? data.user ?? data.account;
    if (!owner) {
      this.logger.debug('handleDepositReceived: missing owner address; skipping');
      return;
    }

    // --- 1. Resolve the user UUID from their Stellar address ----------------
    const user = await this.userRepository.findOne({
      where: { stellar_address: owner },
    });

    // --- 2. Respect the deposit_notifications opt-out preference -----------
    if (user) {
      const prefs = await this.userPreferencesRepository.findOne({
        where: { userId: user.id },
      });
      if (prefs && !prefs.deposit_notifications) {
        this.logger.debug(
          `handleDepositReceived: user ${user.id} has opted out of deposit notifications; skipping`,
        );
        return;
      }
    }

    // --- 3. Create the notification, routing via user preferences when known -
    await this.notificationsService.create(
      owner,
      NotificationType.Deposit,
      'Deposit confirmed! 💰',
      `Your deposit of ${data.amount} stroops has been confirmed.`,
      {
        amount: data.amount,
        ...(data.asset ? { asset: data.asset } : {}),
        ...(data.transactionHash ? { transaction_hash: data.transactionHash } : {}),
      },
      user?.id,
    );

    this.logger.log(
      `handleDepositReceived: notification created for owner=${owner} amount=${data.amount}`,
    );
  }

  /** Alias for handleDepositReceived to support direct event topic matching. */
  async handleDeposit(data: {
    owner?: string;
    user?: string;
    account?: string;
    amount: string;
    asset?: string;
    transactionHash?: string;
    [key: string]: unknown;
  }): Promise<void> {
    return this.handleDepositReceived(data);
  }

  /**
   * A group savings pool was settled and paid out to members.
   *
   * Delivery rules:
   * 1. Supports either a list of `members` or single `member` record in `data`.
   * 2. For each member, resolve their User row and respect `group_settlement_notifications`.
   * 3. Dispatches a notification to each member detailing their settled share.
   */
  async handleGroupSettled(data: {
    groupId?: string;
    id?: string;
    group_id?: string;
    groupName?: string;
    name?: string;
    members?: Array<{
      address?: string;
      member?: string;
      share?: string | number;
      amount?: string;
      settledShare?: string;
      share_bps?: number;
    }>;
    member?: string;
    amount?: string;
    share?: string | number;
    settledShare?: string;
    [key: string]: unknown;
  }): Promise<void> {
    const groupId = String(data.groupId ?? data.id ?? data.group_id ?? 'unknown');
    const groupName = data.groupName ?? data.name;

    const membersList: Array<{ address: string; shareText: string }> = [];

    if (Array.isArray(data.members) && data.members.length > 0) {
      for (const m of data.members) {
        const address = m.address ?? m.member;
        if (address) {
          const shareVal = m.amount ?? m.settledShare ?? m.share ?? '0';
          membersList.push({ address, shareText: String(shareVal) });
        }
      }
    } else if (data.member) {
      const shareVal = data.amount ?? data.settledShare ?? data.share ?? '0';
      membersList.push({ address: data.member, shareText: String(shareVal) });
    }

    if (membersList.length === 0) {
      this.logger.debug(
        `handleGroupSettled: no members to notify for group ${groupId}`,
      );
      return;
    }

    for (const member of membersList) {
      // --- 1. Resolve the user UUID from their Stellar address ----------------
      const user = await this.userRepository.findOne({
        where: { stellar_address: member.address },
      });

      // --- 2. Respect the group_settlement_notifications opt-out preference ---
      if (user) {
        const prefs = await this.userPreferencesRepository.findOne({
          where: { userId: user.id },
        });
        if (prefs && !prefs.group_settlement_notifications) {
          this.logger.debug(
            `handleGroupSettled: user ${user.id} has opted out of group_settlement notifications; skipping`,
          );
          continue;
        }
      }

      // --- 3. Create the notification per member ------------------------------
      const groupLabel = groupName ? `"${groupName}"` : `Group pool #${groupId}`;
      await this.notificationsService.create(
        member.address,
        NotificationType.GroupSettled,
        'Group pool settled! 🤝',
        `Your group savings pool ${groupLabel} has settled. Your share of ${member.shareText} stroops is now available.`,
        {
          group_id: groupId,
          share: member.shareText,
          amount: member.shareText,
          ...(groupName ? { group_name: groupName } : {}),
        },
        user?.id,
      );

      this.logger.log(
        `handleGroupSettled: notification created for member=${member.address} group=${groupId}`,
      );
    }
  }
}
