import { validate } from './env.validation';

describe('Environment Validation', () => {
  const validConfig = {
    DATABASE_URL: 'postgresql://localhost:5432/test',
    JWT_SECRET: 'a'.repeat(32),
    JWT_EXPIRES_IN: '1h',
    STELLAR_NETWORK: 'testnet',
    SOROBAN_CONTRACT_ID: 'CABC123456789DEFGHIJKLMNOPQRSTUVWXYZ123456789012345678',
    USDC_TOKEN_ADDRESS: 'CDEF123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789012345',
    YIELD_ADAPTER_CONTRACT_ID: 'CGHI123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789012345',
    SERVER_SECRET_KEY: 'secret',
    PORT: '3000',
  };

  describe('SOROBAN_CONTRACT_ID validation', () => {
    it('should accept valid Stellar contract address', () => {
      expect(() => validate(validConfig)).not.toThrow();
    });

    it('should reject contract ID not starting with C', () => {
      const config = {
        ...validConfig,
        SOROBAN_CONTRACT_ID: 'GABC123456789DEFGHIJKLMNOPQRSTUVWXYZ123456789012345678',
      };

      expect(() => validate(config)).toThrow(/SOROBAN_CONTRACT_ID/);
      expect(() => validate(config)).toThrow(/valid Stellar contract address/);
    });

    it('should reject contract ID with wrong length', () => {
      const config = {
        ...validConfig,
        SOROBAN_CONTRACT_ID: 'CABC123',
      };

      expect(() => validate(config)).toThrow(/SOROBAN_CONTRACT_ID/);
    });

    it('should reject missing contract ID', () => {
      const config = { ...validConfig };
      delete config.SOROBAN_CONTRACT_ID;

      expect(() => validate(config)).toThrow(/SOROBAN_CONTRACT_ID/);
    });

    it('should reject empty contract ID', () => {
      const config = {
        ...validConfig,
        SOROBAN_CONTRACT_ID: '',
      };

      expect(() => validate(config)).toThrow(/SOROBAN_CONTRACT_ID/);
    });
  });

  describe('USDC_TOKEN_ADDRESS validation', () => {
    it('should accept valid USDC token address', () => {
      expect(() => validate(validConfig)).not.toThrow();
    });

    it('should reject token address not starting with C', () => {
      const config = {
        ...validConfig,
        USDC_TOKEN_ADDRESS: 'GDEF123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789012345',
      };

      expect(() => validate(config)).toThrow(/USDC_TOKEN_ADDRESS/);
      expect(() => validate(config)).toThrow(/valid Stellar contract address/);
    });

    it('should reject token address with invalid characters', () => {
      const config = {
        ...validConfig,
        USDC_TOKEN_ADDRESS: 'Cabc123456789defghijklmnopqrstuvwxyz123456789012345',
      };

      expect(() => validate(config)).toThrow(/USDC_TOKEN_ADDRESS/);
    });

    it('should reject missing token address', () => {
      const config = { ...validConfig };
      delete config.USDC_TOKEN_ADDRESS;

      expect(() => validate(config)).toThrow(/USDC_TOKEN_ADDRESS/);
    });

    it('should reject empty token address', () => {
      const config = {
        ...validConfig,
        USDC_TOKEN_ADDRESS: '',
      };

      expect(() => validate(config)).toThrow(/USDC_TOKEN_ADDRESS/);
    });
  });

  describe('YIELD_ADAPTER_CONTRACT_ID validation', () => {
    it('should accept valid yield adapter contract address', () => {
      expect(() => validate(validConfig)).not.toThrow();
    });

    it('should reject yield adapter contract ID not starting with C', () => {
      const config = {
        ...validConfig,
        YIELD_ADAPTER_CONTRACT_ID: 'GGHI123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789012345',
      };

      expect(() => validate(config)).toThrow(/YIELD_ADAPTER_CONTRACT_ID/);
      expect(() => validate(config)).toThrow(/valid Stellar contract address/);
    });

    it('should reject yield adapter contract ID with wrong length', () => {
      const config = {
        ...validConfig,
        YIELD_ADAPTER_CONTRACT_ID: 'CGHI123',
      };

      expect(() => validate(config)).toThrow(/YIELD_ADAPTER_CONTRACT_ID/);
    });

    it('should reject missing yield adapter contract ID', () => {
      const config = { ...validConfig };
      delete config.YIELD_ADAPTER_CONTRACT_ID;

      expect(() => validate(config)).toThrow(/YIELD_ADAPTER_CONTRACT_ID/);
    });

    it('should reject empty yield adapter contract ID', () => {
      const config = {
        ...validConfig,
        YIELD_ADAPTER_CONTRACT_ID: '',
      };

      expect(() => validate(config)).toThrow(/YIELD_ADAPTER_CONTRACT_ID/);
    });
  });

  describe('Startup behavior', () => {
    it('should fail fast with clear message when savings config is invalid', () => {
      const config = {
        ...validConfig,
        SOROBAN_CONTRACT_ID: 'invalid',
        USDC_TOKEN_ADDRESS: 'invalid',
        YIELD_ADAPTER_CONTRACT_ID: 'invalid',
      };

      let errorMessage = '';
      try {
        validate(config);
      } catch (err) {
        errorMessage = (err as Error).message;
      }

      expect(errorMessage).toContain('Environment validation failed');
      expect(errorMessage).toContain('SOROBAN_CONTRACT_ID');
      expect(errorMessage).toContain('USDC_TOKEN_ADDRESS');
      expect(errorMessage).toContain('YIELD_ADAPTER_CONTRACT_ID');
      expect(errorMessage).toContain(
        'Please check your .env file and ensure all required variables are set',
      );
    });
  });
});
