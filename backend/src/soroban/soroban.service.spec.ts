import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  rpc as SorobanRpc,
  Keypair,
  StrKey,
  SorobanDataBuilder,
} from '@stellar/stellar-sdk';
import {
  SorobanService,
  computeRpcBackoffDelay,
  isTransientRpcError,
} from './soroban.service';

describe('SorobanService', () => {
  let service: SorobanService;
  let mockConfigService: jest.Mocked<ConfigService>;

  const testKeypair = Keypair.random();
  const testServerKeypair = Keypair.random();
  const testMarketId = 'market_123';
  const testOutcome = 'Yes';
  const testStake = '1000000';
  // Generate a valid Soroban contract ID (starts with 'C')
  const validContractId = StrKey.encodeContract(Buffer.alloc(32));

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          SOROBAN_CONTRACT_ID: validContractId,
          STELLAR_NETWORK: 'testnet',
          SERVER_SECRET_KEY: testServerKeypair.secret(),
          SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
        };
        return values[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    jest
      .spyOn(SorobanRpc.Server.prototype, 'getHealth')
      .mockResolvedValue({ status: 'healthy' } as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<SorobanService>(SorobanService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes rpc client and passes connection test', async () => {
    expect(service.getRpcClient()).toBeDefined();
    await expect(service.testConnection()).resolves.toBe(true);
  });

  describe('submitPrediction', () => {
    it('should submit a prediction and return tx_hash', async () => {
      const result = await service.submitPrediction(
        testKeypair.publicKey(),
        testMarketId,
        testOutcome,
        testStake,
      );

      expect(result.tx_hash).toBeDefined();
      expect(result.tx_hash).toHaveLength(64);
    });

    it('should throw on invalid user address', async () => {
      await expect(
        service.submitPrediction(
          'invalid-address',
          testMarketId,
          testOutcome,
          testStake,
        ),
      ).rejects.toThrow();
    });
  });

  describe('claimPayout', () => {
    it('should claim payout and return tx_hash', async () => {
      const result = await service.claimPayout(
        testKeypair.publicKey(),
        testMarketId,
      );

      expect(result.tx_hash).toBeDefined();
      expect(result.tx_hash).toHaveLength(64);
    });

    it('should throw on invalid user address', async () => {
      await expect(
        service.claimPayout('invalid-address', testMarketId),
      ).rejects.toThrow();
    });
  });

  describe('refundCompetitionParticipant', () => {
    it('should successfully refund a participant', async () => {
      const mockTxHash = 'a'.repeat(64);
      jest.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => testServerKeypair.publicKey(),
        incrementSequenceNumber: () => {},
      });

      jest
        .spyOn(SorobanRpc.Server.prototype, 'simulateTransaction')
        .mockResolvedValue({
          results: [{}],
          transactionData: new SorobanDataBuilder(),
          result: { auth: [] },
          minResourceFee: '100',
          _parsed: true,
        } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValue({
          status: 'PENDING',
          hash: mockTxHash,
        } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValue({
          status: 'SUCCESS',
          hash: mockTxHash,
        } as never);

      const result = await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      expect(result.tx_hash).toBe(mockTxHash);
    });

    it('should throw EscrowEmpty error when simulation fails with that message', async () => {
      jest.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => testServerKeypair.publicKey(),
        incrementSequenceNumber: () => {},
      });

      jest
        .spyOn(SorobanRpc.Server.prototype, 'simulateTransaction')
        .mockResolvedValue({
          error: 'Contract Error: EscrowEmpty',
          _parsed: true,
        } as never);

      await expect(
        service.refundCompetitionParticipant(
          testKeypair.publicKey(),
          'comp_123',
          '1000000',
        ),
      ).rejects.toThrow('EscrowEmpty');
    });

    it('should throw InsufficientFunds error when simulation fails with that message', async () => {
      jest.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => testServerKeypair.publicKey(),
        incrementSequenceNumber: () => {},
      });

      jest
        .spyOn(SorobanRpc.Server.prototype, 'simulateTransaction')
        .mockResolvedValue({
          error: 'Contract Error: InsufficientFunds',
          _parsed: true,
        } as never);

      await expect(
        service.refundCompetitionParticipant(
          testKeypair.publicKey(),
          'comp_123',
          '1000000',
        ),
      ).rejects.toThrow('InsufficientFunds');
    });
  });

  describe('resolveMarket', () => {
    it('should resolve market and return void', async () => {
      await expect(
        service.resolveMarket(testMarketId, testOutcome),
      ).resolves.toBeUndefined();
    });
  });

  describe('isTransientRpcError', () => {
    it('classifies network-level TypeErrors as transient', () => {
      expect(isTransientRpcError(new TypeError('fetch failed'))).toBe(true);
    });

    it('classifies AbortError as transient', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      expect(isTransientRpcError(error)).toBe(true);
    });

    it('classifies errno-coded causes as transient', () => {
      const error = new Error('request failed');
      (error as { cause?: unknown }).cause = { code: 'ECONNRESET' };
      expect(isTransientRpcError(error)).toBe(true);
    });

    it('classifies HTTP 5xx as transient', () => {
      expect(isTransientRpcError(new Error('HTTP 503'))).toBe(true);
    });

    it('classifies HTTP 429 as transient', () => {
      expect(isTransientRpcError(new Error('HTTP 429'))).toBe(true);
    });

    it('classifies HTTP 4xx (non-429) as permanent', () => {
      expect(isTransientRpcError(new Error('HTTP 400'))).toBe(false);
    });

    it('classifies non-Error values as permanent', () => {
      expect(isTransientRpcError('some string')).toBe(false);
    });

    it('classifies unrelated errors (e.g. contract logic) as permanent', () => {
      expect(isTransientRpcError(new Error('InsufficientFunds'))).toBe(false);
    });
  });

  describe('computeRpcBackoffDelay', () => {
    it('grows exponentially with the attempt index, within jitter bounds', () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const delay = computeRpcBackoffDelay(500, attempt);
        const exact = 500 * Math.pow(4, attempt);
        expect(delay).toBeGreaterThanOrEqual(Math.floor(exact * 0.8));
        expect(delay).toBeLessThanOrEqual(Math.ceil(exact * 1.2));
      }
    });

    it('never returns a negative delay', () => {
      const delay = computeRpcBackoffDelay(1, 0);
      expect(delay).toBeGreaterThanOrEqual(0);
    });
  });

  describe('retry/backoff on RPC calls', () => {
    beforeEach(() => {
      // Speed up retry-driven tests: no real waiting between attempts.
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
        fn();
        return 0 as unknown as NodeJS.Timeout;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('recovers from a transient testConnection failure and reports healthy', async () => {
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getHealth')
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({ status: 'healthy' } as never);

      await expect(service.testConnection()).resolves.toBe(true);
      expect(service.isRpcHealthy()).toBe(true);
      expect(service.getConsecutiveRpcFailures()).toBe(0);
    });

    it('marks the service unhealthy after persistent testConnection failures', async () => {
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getHealth')
        .mockRejectedValue(new TypeError('fetch failed'));

      // Each testConnection() call exhausts SOROBAN_RPC_MAX_RETRIES (default 3)
      // attempts and, on final failure, increments the consecutive-failure
      // counter once. Three calls cross RPC_UNHEALTHY_FAILURE_THRESHOLD (3).
      await expect(service.testConnection()).rejects.toThrow('fetch failed');
      await expect(service.testConnection()).rejects.toThrow('fetch failed');
      expect(service.isRpcHealthy()).toBe(true); // still below threshold

      await expect(service.testConnection()).rejects.toThrow('fetch failed');
      expect(service.isRpcHealthy()).toBe(false);
      expect(service.getConsecutiveRpcFailures()).toBe(3);

      expect(SorobanRpc.Server.prototype.getHealth).toHaveBeenCalledTimes(9); // 3 calls * 3 attempts
    });

    it('does not retry a permanent (non-transient) testConnection failure', async () => {
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getHealth')
        .mockRejectedValue(new Error('HTTP 400'));

      await expect(service.testConnection()).rejects.toThrow('HTTP 400');
      expect(SorobanRpc.Server.prototype.getHealth).toHaveBeenCalledTimes(1);
      // Permanent errors don't count toward the RPC-connectivity outage signal.
      expect(service.getConsecutiveRpcFailures()).toBe(0);
      expect(service.isRpcHealthy()).toBe(true);
    });

    it('recovers after a transient getEvents HTTP failure without losing events', async () => {
      let callCount = 0;
      jest.spyOn(global, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { ok: false, status: 503 } as unknown as Response;
        }
        return {
          ok: true,
          json: async () => ({
            result: {
              events: [
                {
                  id: 'evt-1',
                  ledger: 100,
                  topic: ['deposit'],
                  value: { amount: '1000' },
                },
              ],
              latestLedger: 100,
            },
          }),
        } as unknown as Response;
      });

      const result = await service.getEvents(1);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].id).toBe('evt-1');
      expect(result.latestLedger).toBe(100);
      expect(callCount).toBe(2);
    });

    it('exhausts retries on a persistent getEvents failure and returns partial results safely', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

      const result = await service.getEvents(1);

      // Safe-exit: no events collected, but the call resolves rather than
      // throwing, and the caller keeps its last-known checkpoint.
      expect(result.events).toEqual([]);
      expect(result.latestLedger).toBe(1);
      expect(service.getConsecutiveRpcFailures()).toBe(1);

      // A single failed poll isn't a persistent outage yet — it takes
      // RPC_UNHEALTHY_FAILURE_THRESHOLD (3) consecutive failures.
      expect(service.isRpcHealthy()).toBe(true);

      await service.getEvents(1);
      await service.getEvents(1);
      expect(service.isRpcHealthy()).toBe(false);
    });
  });
});
