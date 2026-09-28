import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IndexerService, CHECKPOINT_LEDGER_KEY } from './indexer.service';
import {
  ContractEvent,
  ContractEventStatus,
} from './entities/contract-event.entity';
import { FeeHistory } from './entities/fee-history.entity';
import { IndexerCheckpoint } from './entities/indexer-checkpoint.entity';
import { ReconciliationService } from './reconciliation.service';
import { SorobanService, SorobanRpcEvent } from '../soroban/soroban.service';
import { SavingsProjectionService } from '../savings-projection/savings-projection.service';

describe('IndexerService', () => {
  let service: IndexerService;

  let contractEventRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  let checkpointRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };

  let sorobanService: {
    getEvents: jest.Mock;
  };

  let configService: {
    get: jest.Mock;
  };

  beforeEach(async () => {
    contractEventRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => ({
        id: 'uuid-1',
        ...dto,
      })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      createQueryBuilder: jest.fn(),
    };

    checkpointRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    sorobanService = {
      getEvents: jest.fn().mockResolvedValue({ events: [], latestLedger: 100 }),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'SOROBAN_CONTRACT_ID') return 'C1234567890VAULT';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        { provide: ConfigService, useValue: configService },
        {
          provide: getRepositoryToken(ContractEvent),
          useValue: contractEventRepo,
        },
        { provide: getRepositoryToken(FeeHistory), useValue: {} },
        {
          provide: getRepositoryToken(IndexerCheckpoint),
          useValue: checkpointRepo,
        },
        { provide: ReconciliationService, useValue: {} },
        { provide: SorobanService, useValue: sorobanService },
        {
          provide: SavingsProjectionService,
          useValue: { apply: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<IndexerService>(IndexerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pollContractEvents', () => {
    it('skips polling when contractId is not configured', async () => {
      configService.get.mockReturnValue('your-contract-id-here');

      await service.pollContractEvents();

      expect(sorobanService.getEvents).not.toHaveBeenCalled();
    });

    it('fetches events from Soroban RPC, persists as PENDING, processes them, and advances checkpoint', async () => {
      checkpointRepo.findOne.mockResolvedValue(null); // start checkpoint = 0

      const mockEvents: SorobanRpcEvent[] = [
        {
          id: 'evt-1',
          ledger: 10,
          topic: ['deposit'],
          value: { user: 'G123', amount: '100' },
          txHash: 'hash1',
        },
        {
          id: 'evt-2',
          ledger: 12,
          topic: ['withdraw'],
          value: { user: 'G456', amount: '50' },
          txHash: 'hash2',
        },
      ];

      sorobanService.getEvents.mockResolvedValue({
        events: mockEvents,
        latestLedger: 15,
      });

      // Mock processPendingBatch find
      contractEventRepo.find.mockResolvedValue([
        {
          id: 'uuid-1',
          ledger: 10,
          log_index: 0,
          event_type: 'deposit',
          data: { user: 'G123', amount: '100' },
          tx_hash: 'hash1',
          status: ContractEventStatus.PENDING,
          retry_count: 0,
        },
        {
          id: 'uuid-2',
          ledger: 12,
          log_index: 1,
          event_type: 'withdraw',
          data: { user: 'G456', amount: '50' },
          tx_hash: 'hash2',
          status: ContractEventStatus.PENDING,
          retry_count: 0,
        },
      ]);

      await service.pollContractEvents();

      // Verify Soroban RPC was called starting from startLedger = 1 (0 + 1)
      expect(sorobanService.getEvents).toHaveBeenCalledWith(1);

      // Verify events were saved as PENDING
      expect(contractEventRepo.create).toHaveBeenCalledTimes(2);
      expect(contractEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ledger: 10,
          log_index: 0,
          event_type: 'deposit',
          status: ContractEventStatus.PENDING,
        }),
      );

      // Verify processPendingBatch set status to PROCESSED
      expect(contractEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ContractEventStatus.PROCESSED,
        }),
      );

      // Verify checkpoint was updated to latest ledger (15)
      expect(checkpointRepo.save).toHaveBeenCalledWith({
        key: CHECKPOINT_LEDGER_KEY,
        value: 15,
      });

      await expect(service.getMetrics()).resolves.toEqual(
        expect.objectContaining({
          total_events_processed: 2,
          deposits_processed: 1,
          withdrawals_processed: 1,
        }),
      );
    });

    it('advances checkpoint safely when range is empty', async () => {
      // Current checkpoint is at ledger 50
      checkpointRepo.findOne.mockImplementation(({ where }: { where: { key: string } }) => {
        if (where.key === CHECKPOINT_LEDGER_KEY) {
          return Promise.resolve({ key: CHECKPOINT_LEDGER_KEY, value: 50 });
        }
        return Promise.resolve(null);
      });

      // Soroban RPC returns no events, but latest ledger is 60
      sorobanService.getEvents.mockResolvedValue({
        events: [],
        latestLedger: 60,
      });

      await service.pollContractEvents();

      expect(sorobanService.getEvents).toHaveBeenCalledWith(51);
      expect(contractEventRepo.create).not.toHaveBeenCalled();

      // Checkpoint advances to 60
      expect(checkpointRepo.save).toHaveBeenCalledWith({
        key: CHECKPOINT_LEDGER_KEY,
        value: 60,
      });
    });

    it('skips duplicate events that already exist in database', async () => {
      checkpointRepo.findOne.mockResolvedValue(null);

      const mockEvents: SorobanRpcEvent[] = [
        {
          id: 'evt-1',
          ledger: 10,
          topic: ['deposit'],
          value: { user: 'G123' },
        },
      ];

      sorobanService.getEvents.mockResolvedValue({
        events: mockEvents,
        latestLedger: 10,
      });

      // Simulate event already existing in DB
      contractEventRepo.findOne.mockResolvedValue({ id: 'existing-id' });

      await service.pollContractEvents();

      expect(contractEventRepo.create).not.toHaveBeenCalled();
      expect(checkpointRepo.save).toHaveBeenCalledWith({
        key: CHECKPOINT_LEDGER_KEY,
        value: 10,
      });
    });

    it('decodes a withdraw_claimed event and resolves the matching pending withdrawal', async () => {
      checkpointRepo.findOne.mockResolvedValue(null);

      const mockEvents: SorobanRpcEvent[] = [
        {
          id: 'evt-claimed',
          ledger: 30,
          topic: ['withdraw_claimed'],
          value: { withdrawalId: 'wd-42', user: 'G789', amount: '75' },
          txHash: 'hash-claimed',
        },
      ];

      sorobanService.getEvents.mockResolvedValue({
        events: mockEvents,
        latestLedger: 30,
      });

      // The pending-withdrawal record that should be resolved by the claim.
      const pendingWithdrawal = {
        id: 'wd-42',
        status: 'pending',
        resolved: false,
      };

      contractEventRepo.find.mockResolvedValue([
        {
          id: 'uuid-claimed',
          ledger: 30,
          log_index: 0,
          event_type: 'withdraw_claimed',
          data: { withdrawalId: 'wd-42', user: 'G789', amount: '75' },
          tx_hash: 'hash-claimed',
          status: ContractEventStatus.PENDING,
          retry_count: 0,
        },
      ]);

      await service.pollContractEvents();

      // The withdraw_claimed event was decoded and persisted.
      expect(contractEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ledger: 30,
          event_type: 'withdraw_claimed',
          status: ContractEventStatus.PENDING,
        }),
      );

      // The matching pending-withdrawal record is marked resolved.
      expect(pendingWithdrawal.resolved).toBe(true);
      expect(pendingWithdrawal.status).toBe('claimed');

      // The event itself is processed (no longer pending).
      expect(contractEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ContractEventStatus.PROCESSED,
        }),
      );
    });
  });

  describe('backfillEvents', () => {
    it('fetches and backfills missing events in the given range', async () => {
      const mockEvents: SorobanRpcEvent[] = [
        {
          id: 'evt-1',
          ledger: 20,
          topic: ['goal_reached'],
          value: { goalId: '1' },
          txHash: 'hash-backfill',
        },
      ];

      sorobanService.getEvents.mockImplementation((from: number) => {
        if (from === 15) {
          return Promise.resolve({ events: mockEvents, latestLedger: 20 });
        }
        return Promise.resolve({ events: [], latestLedger: 20 });
      });

      await service.backfillEvents(15, 20);

      expect(contractEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ledger: 20,
          event_type: 'goal_reached',
          status: ContractEventStatus.PENDING,
        }),
      );
    });
  });
});
