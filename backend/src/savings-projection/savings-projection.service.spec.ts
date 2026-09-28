import { Test, TestingModule } from '@nestjs/testing';
import { SavingsProjectionService } from './savings-projection.service';
import { GoalsService } from '../goals/goals.service';
import { BalanceService } from '../savings/balance.service';
import { GroupsService } from '../savings/groups.service';
import { LockedPlansService } from '../savings/locked-plans.service';
import { NotificationGeneratorService } from '../notifications/notification-generator.service';
import { GoalStatus } from '../goals/entities/goal.entity';

describe('SavingsProjectionService', () => {
  let service: SavingsProjectionService;
  let goalsService: {
    upsertCreated: jest.Mock;
    applyContribution: jest.Mock;
    markReached: jest.Mock;
  };
  let balanceService: { credit: jest.Mock; setBalance: jest.Mock };
  let groupsService: { markSettled: jest.Mock };
  let lockedPlansService: { upsertCreated: jest.Mock };
  let notificationGeneratorService: {
    handleGoalReached: jest.Mock;
    handleGroupSettled: jest.Mock;
  };

  beforeEach(async () => {
    goalsService = {
      upsertCreated: jest.fn(),
      applyContribution: jest.fn(),
      markReached: jest.fn(),
    };
    balanceService = { credit: jest.fn(), setBalance: jest.fn() };
    groupsService = { markSettled: jest.fn() };
    lockedPlansService = { upsertCreated: jest.fn() };
    notificationGeneratorService = {
      handleGoalReached: jest.fn(),
      handleGroupSettled: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingsProjectionService,
        { provide: GoalsService, useValue: goalsService },
        { provide: BalanceService, useValue: balanceService },
        { provide: GroupsService, useValue: groupsService },
        { provide: LockedPlansService, useValue: lockedPlansService },
        {
          provide: NotificationGeneratorService,
          useValue: notificationGeneratorService,
        },
      ],
    }).compile();

    service = module.get<SavingsProjectionService>(SavingsProjectionService);
  });

  describe('deposit', () => {
    it('credits the flexible balance for the event owner exactly once', async () => {
      await service.apply('deposit', { owner: 'GALICE', amount: '100' });

      expect(balanceService.credit).toHaveBeenCalledTimes(1);
      expect(balanceService.credit).toHaveBeenCalledWith('GALICE', '100');
    });
  });

  describe('withdraw', () => {
    it('sets the flexible balance to the event-provided new_balance exactly once', async () => {
      await service.apply('withdraw', {
        owner: 'GALICE',
        amount: '40',
        new_balance: '60',
        timestamp: 1_700_000_000,
      });

      expect(balanceService.setBalance).toHaveBeenCalledTimes(1);
      expect(balanceService.setBalance).toHaveBeenCalledWith('GALICE', '60');
      expect(balanceService.credit).not.toHaveBeenCalled();
    });

    it('is idempotent — applying the same withdraw event twice sets the same final balance both times', async () => {
      // Unlike a decrement-by-amount approach, replaying the same withdraw
      // event must not decrement the balance twice — using the contract's
      // own new_balance as an absolute set is what makes this safe.
      const params = {
        owner: 'GALICE',
        amount: '40',
        new_balance: '60',
      };

      await service.apply('withdraw', params);
      await service.apply('withdraw', params);

      expect(balanceService.setBalance).toHaveBeenCalledTimes(2);
      expect(balanceService.setBalance).toHaveBeenNthCalledWith(
        1,
        'GALICE',
        '60',
      );
      expect(balanceService.setBalance).toHaveBeenNthCalledWith(
        2,
        'GALICE',
        '60',
      );
    });

    it('falls back to data.user / data.account when data.owner is absent', async () => {
      await service.apply('withdraw', {
        user: 'GBOB',
        amount: '10',
        new_balance: '90',
      });
      expect(balanceService.setBalance).toHaveBeenCalledWith('GBOB', '90');

      await service.apply('withdraw', {
        account: 'GCAROL',
        amount: '10',
        new_balance: '5',
      });
      expect(balanceService.setBalance).toHaveBeenCalledWith('GCAROL', '5');
    });
  });

  describe('locked_created', () => {
    it('upserts the projected plan with the decoded id, owner, amount, and unlock_at', async () => {
      lockedPlansService.upsertCreated.mockResolvedValue({
        on_chain_id: '1',
        owner: 'GALICE',
        balance: '20000000',
        unlock_at: new Date(1_798_761_600 * 1000),
      });

      await service.apply('locked_created', {
        id: '1',
        owner: 'GALICE',
        amount: '20000000',
        unlock_at: 1_798_761_600,
        timestamp: 1_700_000_000,
      });

      expect(lockedPlansService.upsertCreated).toHaveBeenCalledTimes(1);
      expect(lockedPlansService.upsertCreated).toHaveBeenCalledWith({
        onChainId: '1',
        owner: 'GALICE',
        balance: '20000000',
        unlockAt: new Date(1_798_761_600 * 1000),
      });
    });

    it('delegates duplicate-event idempotency to LockedPlansService.upsertCreated', async () => {
      // The indexer may redeliver the same locked_created event (e.g. after
      // a checkpoint replay). SavingsProjectionService always calls
      // upsertCreated — the "don't duplicate" guarantee lives in
      // LockedPlansService, which is unit-tested separately for that
      // behavior (see locked-plans.service.spec.ts). Here we only confirm
      // this service calls through with the same decoded params both times,
      // so applying the same event twice is safe to do.
      const params = {
        id: '1',
        owner: 'GALICE',
        amount: '20000000',
        unlock_at: 1_798_761_600,
      };

      await service.apply('locked_created', params);
      await service.apply('locked_created', params);

      expect(lockedPlansService.upsertCreated).toHaveBeenCalledTimes(2);
      expect(lockedPlansService.upsertCreated).toHaveBeenNthCalledWith(1, {
        onChainId: '1',
        owner: 'GALICE',
        balance: '20000000',
        unlockAt: new Date(1_798_761_600 * 1000),
      });
      expect(lockedPlansService.upsertCreated).toHaveBeenNthCalledWith(2, {
        onChainId: '1',
        owner: 'GALICE',
        balance: '20000000',
        unlockAt: new Date(1_798_761_600 * 1000),
      });
    });
  });

  describe('goal_reached', () => {
    it('marks the goal reached and notifies once when newly reached', async () => {
      goalsService.markReached.mockResolvedValue({
        goal: {
          on_chain_id: 'goal-1',
          owner: 'GALICE',
          name: 'Vacation',
          target_amount: '1000',
          status: GoalStatus.REACHED,
        },
        changed: true,
      });

      await service.apply('goal_reached', { id: 'goal-1' });

      expect(goalsService.markReached).toHaveBeenCalledWith('goal-1');
      expect(
        notificationGeneratorService.handleGoalReached,
      ).toHaveBeenCalledWith({
        goalId: 'goal-1',
        owner: 'GALICE',
        name: 'Vacation',
        targetAmount: '1000',
      });
    });

    it('does not notify again when the goal was already reached (idempotent)', async () => {
      goalsService.markReached.mockResolvedValue({
        goal: {
          on_chain_id: 'goal-1',
          owner: 'GALICE',
          name: 'Vacation',
          target_amount: '1000',
          status: GoalStatus.REACHED,
        },
        changed: false,
      });

      await service.apply('goal_reached', { id: 'goal-1' });

      expect(
        notificationGeneratorService.handleGoalReached,
      ).not.toHaveBeenCalled();
    });
  });

  describe('group_split_settled', () => {
    it('settles the projected group and notifies once', async () => {
      groupsService.markSettled.mockResolvedValue({
        group: { on_chain_id: 'group-1', settled: true, balance: '0' },
        changed: true,
      });

      await service.apply('group_split_settled', {
        id: 'group-1',
        member: 'GALICE',
        amount: '250',
      });

      expect(groupsService.markSettled).toHaveBeenCalledWith('group-1');
      expect(
        notificationGeneratorService.handleGroupSettled,
      ).toHaveBeenCalledTimes(1);
    });

    it('does not notify again once already settled (idempotent)', async () => {
      groupsService.markSettled.mockResolvedValue({
        group: { on_chain_id: 'group-1', settled: true, balance: '0' },
        changed: false,
      });

      await service.apply('group_split_settled', { id: 'group-1' });

      expect(
        notificationGeneratorService.handleGroupSettled,
      ).not.toHaveBeenCalled();
    });
  });

  describe('unknown topics', () => {
    it('does nothing for an unrecognized topic', async () => {
      await expect(
        service.apply('some_unhandled_topic', {}),
      ).resolves.toBeUndefined();
      expect(balanceService.credit).not.toHaveBeenCalled();
      expect(balanceService.setBalance).not.toHaveBeenCalled();
      expect(goalsService.markReached).not.toHaveBeenCalled();
      expect(groupsService.markSettled).not.toHaveBeenCalled();
    });
  });

  describe('strategy_changed', () => {
    it('decodes first activation (from: null, to: strategy_id)', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      await service.apply('strategy_changed', {
        from: null,
        to: '42',
      });

      expect(logSpy).toHaveBeenCalledWith(
        'Strategy activation: strategy_id=42',
      );
    });

    it('decodes migration (from: strategy_id, to: strategy_id)', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      await service.apply('strategy_changed', {
        from: '10',
        to: '20',
      });

      expect(logSpy).toHaveBeenCalledWith('Strategy migration: from=10 to=20');
    });

    it('decodes emergency clear (from: strategy_id, to: null)', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      await service.apply('strategy_changed', {
        from: '15',
        to: null,
      });

      expect(logSpy).toHaveBeenCalledWith(
        'Strategy emergency clear: cleared strategy_id=15',
      );
    });
  });
});
