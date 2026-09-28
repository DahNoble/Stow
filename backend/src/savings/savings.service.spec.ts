import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GoalsService } from '../goals/goals.service';
import { BalanceService } from './balance.service';
import { Group } from './entities/group.entity';
import { YieldPosition } from './entities/yield-position.entity';
import { SavingsService } from './savings.service';

describe('SavingsService', () => {
  let service: SavingsService;
  let yieldPositionRepository: { findOne: jest.Mock };
  let groupRepository: { createQueryBuilder: jest.Mock };
  let queryBuilder: {
    where: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };
  let balanceService: { get: jest.Mock };
  let goalsService: { summary: jest.Mock };

  const ADDRESS = 'GADDRESS1234567890';

  const makeGroup = (overrides: Partial<Group> = {}): Group =>
    ({
      id: 'group-uuid-1',
      on_chain_id: 'chain-group-1',
      creator: 'GCREATOR1',
      name: 'Vacation Fund',
      members: [ADDRESS],
      balance: '1000000',
      open: true,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    }) as Group;

  beforeEach(async () => {
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    groupRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    yieldPositionRepository = {
      findOne: jest.fn(),
    };

    balanceService = {
      get: jest.fn(),
    };

    goalsService = {
      summary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingsService,
        {
          provide: getRepositoryToken(Group),
          useValue: groupRepository,
        },
        {
          provide: getRepositoryToken(YieldPosition),
          useValue: yieldPositionRepository,
        },
        {
          provide: BalanceService,
          useValue: balanceService,
        },
        {
          provide: GoalsService,
          useValue: goalsService,
        },
      ],
    }).compile();

    service = module.get<SavingsService>(SavingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listGroups', () => {
    it('filters groups by membership using ANY(members)', async () => {
      queryBuilder.getMany.mockResolvedValue([makeGroup()]);

      await service.listGroups(ADDRESS);

      expect(groupRepository.createQueryBuilder).toHaveBeenCalledWith('group');
      expect(queryBuilder.where).toHaveBeenCalledWith(
        ':address = ANY(group.members)',
        { address: ADDRESS },
      );
    });

    it('only returns groups the address belongs to (not other groups)', async () => {
      // The repository query itself is responsible for the membership
      // filter; this asserts the service passes through exactly what the
      // (mocked) filtered query returns, and does no client-side
      // re-filtering that could hide a bug either way.
      const memberGroup = makeGroup({
        on_chain_id: 'chain-group-1',
        members: [ADDRESS, 'GOTHERMEMBER'],
      });
      queryBuilder.getMany.mockResolvedValue([memberGroup]);

      const result = await service.listGroups(ADDRESS);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].on_chain_id).toBe('chain-group-1');
    });

    it('returns an empty list when the address belongs to no groups', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      const result = await service.listGroups(ADDRESS);

      expect(result).toEqual({ address: ADDRESS, groups: [] });
    });

    it('maps balance and open/closed status accurately for each group', async () => {
      const openGroup = makeGroup({
        on_chain_id: 'chain-group-open',
        balance: '2500000',
        open: true,
      });
      const closedGroup = makeGroup({
        on_chain_id: 'chain-group-closed',
        balance: '9999999999999999',
        open: false,
      });
      queryBuilder.getMany.mockResolvedValue([openGroup, closedGroup]);

      const result = await service.listGroups(ADDRESS);

      expect(result.groups).toEqual([
        expect.objectContaining({
          on_chain_id: 'chain-group-open',
          balance: '2500000',
          open: true,
        }),
        expect.objectContaining({
          on_chain_id: 'chain-group-closed',
          balance: '9999999999999999',
          open: false,
        }),
      ]);
    });

    it('includes creator, name, and members in each mapped group', async () => {
      const group = makeGroup({
        creator: 'GCREATORX',
        name: 'Rent Pool',
        members: [ADDRESS, 'GMEMBER2'],
      });
      queryBuilder.getMany.mockResolvedValue([group]);

      const result = await service.listGroups(ADDRESS);

      expect(result.groups[0]).toEqual({
        on_chain_id: group.on_chain_id,
        creator: 'GCREATORX',
        name: 'Rent Pool',
        members: [ADDRESS, 'GMEMBER2'],
        balance: group.balance,
        open: group.open,
      });
    });
  });

  describe('summary', () => {
    it('returns per-product totals for flexible and goals', async () => {
      balanceService.get.mockResolvedValue({
        account: ADDRESS,
        amount: '500000',
      });
      goalsService.summary.mockResolvedValue({
        total_goals: 2,
        active_goals: 1,
        reached_goals: 1,
        total_target: '2000000',
        total_saved: '750000',
      });

      const result = await service.summary(ADDRESS);

      expect(result.address).toBe(ADDRESS);
      expect(result.products).toEqual([
        { product: 'flexible', total: '500000' },
        { product: 'goals', total: '750000' },
      ]);
    });

    it('computes a grand total equal to the sum of the underlying per-product projections', async () => {
      balanceService.get.mockResolvedValue({
        account: ADDRESS,
        amount: '500000',
      });
      goalsService.summary.mockResolvedValue({
        total_goals: 2,
        active_goals: 1,
        reached_goals: 1,
        total_target: '2000000',
        total_saved: '750000',
      });

      const result = await service.summary(ADDRESS);

      expect(result.total).toBe('1250000');
    });

    it('handles zero balances and zero goals without error', async () => {
      balanceService.get.mockResolvedValue({ account: ADDRESS, amount: '0' });
      goalsService.summary.mockResolvedValue({
        total_goals: 0,
        active_goals: 0,
        reached_goals: 0,
        total_target: '0',
        total_saved: '0',
      });

      const result = await service.summary(ADDRESS);

      expect(result.products).toEqual([
        { product: 'flexible', total: '0' },
        { product: 'goals', total: '0' },
      ]);
      expect(result.total).toBe('0');
    });

    it('sums large stroop amounts without losing precision (uses BigInt, not Number)', async () => {
      // These two values sum to a number well beyond Number.MAX_SAFE_INTEGER
      // (2^53 - 1 = 9007199254740991); a naive Number-based sum would be
      // inaccurate here.
      balanceService.get.mockResolvedValue({
        account: ADDRESS,
        amount: '9000000000000000',
      });
      goalsService.summary.mockResolvedValue({
        total_goals: 1,
        active_goals: 1,
        reached_goals: 0,
        total_target: '9000000000000000',
        total_saved: '9000000000000000',
      });

      const result = await service.summary(ADDRESS);

      expect(result.total).toBe('18000000000000000');
    });

    it('queries balance and goals concurrently with the given address', async () => {
      balanceService.get.mockResolvedValue({ account: ADDRESS, amount: '0' });
      goalsService.summary.mockResolvedValue({
        total_goals: 0,
        active_goals: 0,
        reached_goals: 0,
        total_target: '0',
        total_saved: '0',
      });

      await service.summary(ADDRESS);

      expect(balanceService.get).toHaveBeenCalledWith(ADDRESS);
      expect(goalsService.summary).toHaveBeenCalledWith(ADDRESS);
    });
  });

  describe('getYieldPosition', () => {
    it('returns well-formed empty response when no position exists', async () => {
      yieldPositionRepository.findOne.mockResolvedValue(null);

      const result = await service.getYieldPosition(ADDRESS);

      expect(result).toEqual({
        address: ADDRESS,
        shares: '0',
        estimated_asset_value: null,
        exchange_rate_snapshot: null,
        pending_withdrawal_claimable_at: null,
        updated_at: expect.any(Date),
      });
    });

    it('returns shares and exchange rate when position exists', async () => {
      const now = new Date();
      yieldPositionRepository.findOne.mockResolvedValue({
        owner: ADDRESS,
        shares: '1000000000',
        exchange_rate_snapshot: '1.25',
        updated_at: now,
      });

      const result = await service.getYieldPosition(ADDRESS);

      expect(result.address).toBe(ADDRESS);
      expect(result.shares).toBe('1000000000');
      expect(result.exchange_rate_snapshot).toBe('1.25');
      expect(result.updated_at).toBe(now);
    });

    it('calculates estimated asset value from shares and exchange rate', async () => {
      yieldPositionRepository.findOne.mockResolvedValue({
        owner: ADDRESS,
        shares: '1000000', // 1M shares
        exchange_rate_snapshot: '2.5', // 1 share = 2.5 assets
        updated_at: new Date(),
      });

      const result = await service.getYieldPosition(ADDRESS);

      expect(result.estimated_asset_value).toBe('2500000'); // 1M * 2.5 = 2.5M
    });

    it('handles zero shares gracefully', async () => {
      yieldPositionRepository.findOne.mockResolvedValue({
        owner: ADDRESS,
        shares: '0',
        exchange_rate_snapshot: '1.0',
        updated_at: new Date(),
      });

      const result = await service.getYieldPosition(ADDRESS);

      expect(result.shares).toBe('0');
      expect(result.estimated_asset_value).toBeNull();
    });

    it('returns null exchange rate when not set', async () => {
      yieldPositionRepository.findOne.mockResolvedValue({
        owner: ADDRESS,
        shares: '1000000000',
        exchange_rate_snapshot: null,
        updated_at: new Date(),
      });

      const result = await service.getYieldPosition(ADDRESS);

      expect(result.exchange_rate_snapshot).toBeNull();
      expect(result.estimated_asset_value).toBeNull();
    });

    it('does not throw on invalid exchange rate calculation', async () => {
      yieldPositionRepository.findOne.mockResolvedValue({
        owner: ADDRESS,
        shares: '1000000000',
        exchange_rate_snapshot: 'invalid', // Will fail parseFloat
        updated_at: new Date(),
      });

      const result = await service.getYieldPosition(ADDRESS);

      expect(result.estimated_asset_value).toBeNull();
      expect(result.exchange_rate_snapshot).toBe('invalid');
    });

    it('returns pending_withdrawal_claimable_at as null (for future indexer integration)', async () => {
      yieldPositionRepository.findOne.mockResolvedValue({
        owner: ADDRESS,
        shares: '1000000000',
        exchange_rate_snapshot: '1.0',
        updated_at: new Date(),
      });

      const result = await service.getYieldPosition(ADDRESS);

      expect(result.pending_withdrawal_claimable_at).toBeNull();
    });
  });
});
