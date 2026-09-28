import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SavingsController } from './savings.controller';
import { SavingsService } from './savings.service';
import { GoalsService } from '../goals/goals.service';
import { LockedPlansService } from './locked-plans.service';
import { BalanceService } from './balance.service';
import { YieldPosition } from './entities/yield-position.entity';

describe('SavingsController', () => {
  let controller: SavingsController;
  let goalsService: { listByOwnerPaginated: jest.Mock; summary: jest.Mock };
  let lockedPlansService: { listByOwner: jest.Mock };
  let balanceService: { findAccount: jest.Mock; get: jest.Mock };
  let yieldPositionRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    goalsService = { listByOwnerPaginated: jest.fn(), summary: jest.fn() };
    lockedPlansService = { listByOwner: jest.fn() };
    balanceService = { findAccount: jest.fn(), get: jest.fn() };
    yieldPositionRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavingsController],
      providers: [
        SavingsService,
        { provide: GoalsService, useValue: goalsService },
        { provide: LockedPlansService, useValue: lockedPlansService },
        { provide: BalanceService, useValue: balanceService },
        {
          provide: getRepositoryToken(YieldPosition),
          useValue: yieldPositionRepository,
        },
      ],
    }).compile();

    controller = module.get<SavingsController>(SavingsController);
  });

  describe('ping', () => {
    it('responds with an ok status', () => {
      expect(controller.ping()).toEqual({ status: 'ok' });
    });
  });

  describe('listGoals', () => {
    it('shapes the paginated service result into ListGoalsDto', async () => {
      goalsService.listByOwnerPaginated.mockResolvedValue({
        data: [
          {
            on_chain_id: 'g1',
            owner: 'GADDR',
            name: 'Trip',
            target_amount: '100',
            current_amount: '40',
            status: 'active',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.listGoals({
        address: 'GADDR',
        page: 1,
        limit: 20,
      });

      expect(goalsService.listByOwnerPaginated).toHaveBeenCalledWith(
        'GADDR',
        1,
        20,
        undefined,
      );
      expect(result).toEqual({
        address: 'GADDR',
        goals: [
          {
            on_chain_id: 'g1',
            owner: 'GADDR',
            name: 'Trip',
            target_amount: '100',
            current_amount: '40',
            status: 'active',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('passes page/limit/sort straight through — SavingsListQueryDto already coerced and validated them', async () => {
      goalsService.listByOwnerPaginated.mockResolvedValue({
        data: [],
        total: 0,
        page: 2,
        limit: 5,
      });

      await controller.listGoals({
        address: 'GADDR',
        page: 2,
        limit: 5,
        sort: 'asc',
      });

      expect(goalsService.listByOwnerPaginated).toHaveBeenCalledWith(
        'GADDR',
        2,
        5,
        'asc',
      );
    });
  });

  describe('listLocked', () => {
    it('shapes the paginated service result into ListLockedDto', async () => {
      lockedPlansService.listByOwner.mockResolvedValue({
        data: [
          {
            on_chain_id: 'p1',
            owner: 'GADDR',
            balance: '500',
            unlock_at: new Date('2030-01-01'),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.listLocked({
        address: 'GADDR',
        page: 1,
        limit: 20,
      });

      expect(lockedPlansService.listByOwner).toHaveBeenCalledWith(
        'GADDR',
        1,
        20,
        undefined,
      );
      expect(result).toEqual({
        address: 'GADDR',
        plans: [
          {
            on_chain_id: 'p1',
            owner: 'GADDR',
            balance: '500',
            unlock_at: new Date('2030-01-01'),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('passes sort=desc straight through to the service', async () => {
      lockedPlansService.listByOwner.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.listLocked({
        address: 'GADDR',
        page: 1,
        limit: 20,
        sort: 'desc',
      });

      expect(lockedPlansService.listByOwner).toHaveBeenCalledWith(
        'GADDR',
        1,
        20,
        'desc',
      );
    });
  });

  describe('getAccount', () => {
    it('returns the account balance and timestamps for a known address', async () => {
      const created = new Date('2026-01-01');
      const updated = new Date('2026-02-01');
      balanceService.findAccount.mockResolvedValue({
        account: 'GADDR',
        amount: '5000000',
        created_at: created,
        updated_at: updated,
      });

      const result = await controller.getAccount({ address: 'GADDR' });

      expect(balanceService.findAccount).toHaveBeenCalledWith('GADDR');
      expect(result).toEqual({
        account: 'GADDR',
        amount: '5000000',
        created_at: created,
        updated_at: updated,
      });
    });

    it('throws NotFoundException for an unknown address', async () => {
      balanceService.findAccount.mockResolvedValue(null);

      await expect(
        controller.getAccount({ address: 'GUNKNOWN' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('summary', () => {
    it('returns per-product totals and grand total for a valid address', async () => {
      balanceService.get.mockResolvedValue({
        account: 'GADDR',
        amount: '500000',
      });
      goalsService.summary.mockResolvedValue({
        total_goals: 1,
        active_goals: 1,
        reached_goals: 0,
        total_target: '1000000',
        total_saved: '250000',
      });

      const result = await controller.summary('GADDR');

      expect(balanceService.get).toHaveBeenCalledWith('GADDR');
      expect(goalsService.summary).toHaveBeenCalledWith('GADDR');
      expect(result).toEqual({
        address: 'GADDR',
        products: [
          { product: 'flexible', total: '500000' },
          { product: 'goals', total: '250000' },
        ],
        total: '750000',
      });
    });

    it('throws BadRequestException when address is missing', async () => {
      await expect(controller.summary(undefined)).rejects.toThrow(
        BadRequestException,
      );
      expect(balanceService.get).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when address is an empty string', async () => {
      await expect(controller.summary('')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getYieldPosition', () => {
    it("returns the authenticated user's yield position", async () => {
      const user = { id: 'user-1', stellar_address: 'GUSER' };
      const updated = new Date();

      const savingsService = controller['savingsService'];
      jest.spyOn(savingsService, 'getYieldPosition').mockResolvedValue({
        address: 'GUSER',
        shares: '1000000000',
        estimated_asset_value: '1250000000',
        exchange_rate_snapshot: '1.25',
        pending_withdrawal_claimable_at: null,
        updated_at: updated,
      });

      const result = await controller.getYieldPosition(user as any);

      expect(savingsService.getYieldPosition).toHaveBeenCalledWith('GUSER');
      expect(result).toEqual({
        address: 'GUSER',
        shares: '1000000000',
        estimated_asset_value: '1250000000',
        exchange_rate_snapshot: '1.25',
        pending_withdrawal_claimable_at: null,
        updated_at: updated,
      });
    });

    it('returns well-formed empty response for a user with no position', async () => {
      const user = { id: 'user-1', stellar_address: 'GNOPOSITION' };

      const savingsService = controller['savingsService'];
      jest.spyOn(savingsService, 'getYieldPosition').mockResolvedValue({
        address: 'GNOPOSITION',
        shares: '0',
        estimated_asset_value: null,
        exchange_rate_snapshot: null,
        pending_withdrawal_claimable_at: null,
        updated_at: expect.any(Date),
      });

      const result = await controller.getYieldPosition(user as any);

      expect(result.shares).toBe('0');
      expect(result.estimated_asset_value).toBeNull();
    });
  });
});
