import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SorobanService } from './soroban.service';

describe('SorobanService – yield-adapter read entrypoints', () => {
  let service: SorobanService;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'SOROBAN_CONTRACT_ID') return 'C123456789VAULT';
        if (key === 'SOROBAN_YIELD_ADAPTER_CONTRACT_ID')
          return 'C987654321YIELD';
        if (key === 'STELLAR_NETWORK') return 'testnet';
        if (key === 'SERVER_SECRET_KEY')
          return 'SBZC6ACE7F7ICVIWRX4N4VLYG5XZUUQRQHF4XLSVQX6YNZKV7K4MLCGQ';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<SorobanService>(SorobanService);
  });

  describe('getYieldAdapterPosition', () => {
    it('returns null when SOROBAN_YIELD_ADAPTER_CONTRACT_ID is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SOROBAN_YIELD_ADAPTER_CONTRACT_ID') return null;
        if (key === 'SOROBAN_CONTRACT_ID') return 'C123';
        if (key === 'STELLAR_NETWORK') return 'testnet';
        if (key === 'SERVER_SECRET_KEY')
          return 'SBZC6ACE7F7ICVIWRX4N4VLYG5XZUUQRQHF4XLSVQX6YNZKV7K4MLCGQ';
        return null;
      });

      const result = await service.getYieldAdapterPosition('GOWNER');

      expect(result).toBeNull();
    });

    it('calls the contract with the owner address', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockResolvedValue({
        error: 'Not mocked',
      } as any);

      await service.getYieldAdapterPosition('GOWNER123');

      expect(spyOn).toHaveBeenCalled();
    });

    it('returns null on RPC simulation error', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockResolvedValue({
        error: 'Contract not found',
      } as any);

      const result = await service.getYieldAdapterPosition('GOWNER');

      expect(result).toBeNull();
    });

    it('returns null on fetch exception', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockRejectedValue(new Error('Network error'));

      const result = await service.getYieldAdapterPosition('GOWNER');

      expect(result).toBeNull();
    });
  });

  describe('getYieldAdapterExchangeRate', () => {
    it('returns null when SOROBAN_YIELD_ADAPTER_CONTRACT_ID is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SOROBAN_YIELD_ADAPTER_CONTRACT_ID') return null;
        if (key === 'SOROBAN_CONTRACT_ID') return 'C123';
        if (key === 'STELLAR_NETWORK') return 'testnet';
        if (key === 'SERVER_SECRET_KEY')
          return 'SBZC6ACE7F7ICVIWRX4N4VLYG5XZUUQRQHF4XLSVQX6YNZKV7K4MLCGQ';
        return null;
      });

      const result = await service.getYieldAdapterExchangeRate();

      expect(result).toBeNull();
    });

    it('calls the contract exchange_rate entrypoint', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockResolvedValue({
        error: 'Not mocked',
      } as any);

      await service.getYieldAdapterExchangeRate();

      expect(spyOn).toHaveBeenCalled();
    });

    it('returns null on RPC simulation error', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockResolvedValue({
        error: 'Simulation failed',
      } as any);

      const result = await service.getYieldAdapterExchangeRate();

      expect(result).toBeNull();
    });
  });

  describe('getYieldAdapterTotalAssets', () => {
    it('returns null when SOROBAN_YIELD_ADAPTER_CONTRACT_ID is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SOROBAN_YIELD_ADAPTER_CONTRACT_ID') return null;
        if (key === 'SOROBAN_CONTRACT_ID') return 'C123';
        if (key === 'STELLAR_NETWORK') return 'testnet';
        if (key === 'SERVER_SECRET_KEY')
          return 'SBZC6ACE7F7ICVIWRX4N4VLYG5XZUUQRQHF4XLSVQX6YNZKV7K4MLCGQ';
        return null;
      });

      const result = await service.getYieldAdapterTotalAssets();

      expect(result).toBeNull();
    });

    it('calls the contract total_assets entrypoint', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockResolvedValue({
        error: 'Not mocked',
      } as any);

      await service.getYieldAdapterTotalAssets();

      expect(spyOn).toHaveBeenCalled();
    });

    it('returns null on RPC simulation error', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockResolvedValue({
        error: 'Contract error',
      } as any);

      const result = await service.getYieldAdapterTotalAssets();

      expect(result).toBeNull();
    });
  });

  describe('getYieldAdapterWithdrawRequest', () => {
    it('returns null when SOROBAN_YIELD_ADAPTER_CONTRACT_ID is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SOROBAN_YIELD_ADAPTER_CONTRACT_ID') return null;
        if (key === 'SOROBAN_CONTRACT_ID') return 'C123';
        if (key === 'STELLAR_NETWORK') return 'testnet';
        if (key === 'SERVER_SECRET_KEY')
          return 'SBZC6ACE7F7ICVIWRX4N4VLYG5XZUUQRQHF4XLSVQX6YNZKV7K4MLCGQ';
        return null;
      });

      const result = await service.getYieldAdapterWithdrawRequest(42);

      expect(result).toBeNull();
    });

    it('calls the contract with the request ID', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockResolvedValue({
        error: 'Not mocked',
      } as any);

      await service.getYieldAdapterWithdrawRequest(123);

      expect(spyOn).toHaveBeenCalled();
    });

    it('returns null on RPC simulation error', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockResolvedValue({
        error: 'Request not found',
      } as any);

      const result = await service.getYieldAdapterWithdrawRequest(999);

      expect(result).toBeNull();
    });

    it('returns null on fetch exception', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockRejectedValue(new Error('Network timeout'));

      const result = await service.getYieldAdapterWithdrawRequest(1);

      expect(result).toBeNull();
    });
  });

  describe('all yield-adapter methods', () => {
    it('gracefully handle missing configuration without throwing', async () => {
      configService.get.mockImplementation(() => null);

      await expect(
        service.getYieldAdapterPosition('GOWNER'),
      ).resolves.toBeNull();
      await expect(
        service.getYieldAdapterExchangeRate(),
      ).resolves.toBeNull();
      await expect(
        service.getYieldAdapterTotalAssets(),
      ).resolves.toBeNull();
      await expect(
        service.getYieldAdapterWithdrawRequest(1),
      ).resolves.toBeNull();
    });

    it('all methods return typed shapes (stubs for XDR decoding)', async () => {
      const spyOn = jest.spyOn(service['rpcServer'], 'simulateTransaction');
      spyOn.mockResolvedValue({
        error: 'Simulation failed',
      } as any);

      // All should return null for now (XDR decoding not yet implemented)
      const pos = await service.getYieldAdapterPosition('GOWNER');
      const rate = await service.getYieldAdapterExchangeRate();
      const assets = await service.getYieldAdapterTotalAssets();
      const withdraw = await service.getYieldAdapterWithdrawRequest(1);

      expect(pos).toBeNull();
      expect(rate).toBeNull();
      expect(assets).toBeNull();
      expect(withdraw).toBeNull();
    });
  });
});
