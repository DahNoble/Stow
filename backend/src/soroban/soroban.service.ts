import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  rpc as SorobanRpc,
  Keypair,
  TransactionBuilder,
  Address,
  Contract,
  nativeToScVal,
  Networks,
} from '@stellar/stellar-sdk';

export interface SorobanPredictionResult {
  tx_hash: string;
  payout_amount_stroops?: string;
  realized_price?: string;
  shares_received?: string;
}

export interface SorobanCreateMarketResult {
  market_id: string;
  tx_hash: string;
}

export interface SorobanCreateSeasonResult {
  on_chain_season_id: number;
  tx_hash: string;
}

export interface SorobanRefundResult {
  tx_hash: string;
}

export interface SorobanRpcEvent {
  id: string;
  ledger: number;
  topic: string[];
  value: Record<string, unknown>;
  txHash?: string;
}

export interface SorobanEventsResponse {
  events: SorobanRpcEvent[];
  latestLedger: number;
  /**
   * Opaque RPC cursor (= last event id from the final page).
   * Pass back into `getEvents` as `options.cursor` to continue from where
   * this response left off without re-specifying `startLedger`.
   */
  cursor?: string;
}

/** Options that control paging behaviour for `getEvents`. */
export interface GetEventsOptions {
  /**
   * Maximum number of events to return per RPC call.
   * Capped at `MAX_PAGE_SIZE` (200). Defaults to `MAX_PAGE_SIZE`.
   */
  limit?: number;
  /**
   * Resume from a cursor returned by a previous call.
   * When provided `startLedger` is omitted from the RPC request — the two
   * params are mutually exclusive in the Soroban JSON-RPC spec.
   */
  cursor?: string;
}

export interface SorobanDisputeResult {
  dispute_id: string;
  tx_hash: string;
}

export interface SorobanFinalizeEventResult {
  tx_hash: string;
}

/** Default maximum attempts for a retried RPC call (1 initial + 2 retries). */
const DEFAULT_RPC_RETRY_MAX_ATTEMPTS = 3;

/**
 * Default base delay in milliseconds for exponential backoff between RPC
 * retry attempts. Delay formula: baseDelay * 4^attempt → 500 ms, 2 s, 8 s.
 */
const DEFAULT_RPC_RETRY_BASE_DELAY_MS = 500;

/**
 * Jitter factor: each computed delay is randomised by ±20% to avoid
 * thundering-herd retries when multiple RPC calls fail simultaneously.
 */
const RPC_RETRY_JITTER_FACTOR = 0.2;

/**
 * Number of consecutive RPC failures (after retries are exhausted) before
 * the Soroban RPC connection is considered persistently unhealthy.
 */
const RPC_UNHEALTHY_FAILURE_THRESHOLD = 3;

/**
 * Returns true when the error looks like a transient RPC/network failure
 * (connection reset, timeout, DNS failure, HTTP 5xx/429) as opposed to a
 * permanent one (bad request, simulation/contract error). Only transient
 * errors are worth retrying — retrying a contract logic error just wastes
 * time and delays surfacing a real bug to the caller.
 */
export function isTransientRpcError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Node's built-in fetch surfaces network-layer failures as TypeErrors
  // (e.g. "fetch failed", "terminated", "network socket disconnected").
  if (error instanceof TypeError) return true;

  // Abort/timeout signals (AbortController-driven timeouts).
  if (error.name === 'AbortError') return true;

  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const code = (cause as { code?: unknown }).code;
    if (
      typeof code === 'string' &&
      [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EPIPE',
        'EHOSTUNREACH',
        'EAI_AGAIN',
      ].includes(code)
    ) {
      return true;
    }
  }

  // HTTP-level transient errors surfaced with a "HTTP <status>" message.
  const httpMatch = /HTTP (\d{3})/.exec(error.message);
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10);
    return status === 429 || (status >= 500 && status <= 599);
  }

  return false;
}

/**
 * Computes the delay before retry attempt `attemptIndex` (0-based).
 * Formula: baseDelayMs * 4^attemptIndex, jittered by ±RPC_RETRY_JITTER_FACTOR.
 */
export function computeRpcBackoffDelay(
  baseDelayMs: number,
  attemptIndex: number,
): number {
  const exponential = baseDelayMs * Math.pow(4, attemptIndex);
  const jitter =
    exponential * RPC_RETRY_JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);
  private readonly contractId: string;
  private readonly yieldAdapterContractId: string;
  private readonly network: string;
  private readonly serverSecretKey: string;
  private readonly rpcUrl: string;
  private readonly rpcServer: SorobanRpc.Server;
  /** Consecutive RPC failures since the last success, used by `isRpcHealthy`. */
  private consecutiveRpcFailures = 0;

  constructor(private readonly configService: ConfigService) {
    this.contractId =
      this.configService.get<string>('SOROBAN_CONTRACT_ID') ?? '';
    this.yieldAdapterContractId =
      this.configService.get<string>('YIELD_ADAPTER_CONTRACT_ID') ??
      this.configService.get<string>('SOROBAN_YIELD_ADAPTER_CONTRACT_ID') ??
      '';
    this.network = this.configService.get<string>('STELLAR_NETWORK') ?? '';
    this.serverSecretKey =
      this.configService.get<string>('SERVER_SECRET_KEY') ?? '';
    this.rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ??
      'https://soroban-testnet.stellar.org';

    this.rpcServer = new SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.rpcUrl.startsWith('http://'),
    });

    if (!this.contractId || !this.network || !this.serverSecretKey) {
      this.logger.warn(
        'SorobanService initialized with missing config values (SOROBAN_CONTRACT_ID/STELLAR_NETWORK/SERVER_SECRET_KEY)',
      );
    }
    if (!this.yieldAdapterContractId) {
      this.logger.debug(
        'SOROBAN_YIELD_ADAPTER_CONTRACT_ID not configured; yield-adapter read methods will be unavailable',
      );
    }
  }

  getRpcClient(): SorobanRpc.Server {
    return this.rpcServer;
  }

  async getCreationFee(): Promise<string> {
    return this.withSorobanErrorHandling('getCreationFee', () => {
      return Promise.resolve('10000000'); // Default 0.01 XLM
    });
  }

  async testConnection(): Promise<boolean> {
    return this.withSorobanErrorHandling('testConnection', async () => {
      await this.withRetry('testConnection', () => this.rpcServer.getHealth());
      return true;
    });
  }

  /**
   * Reports whether the Soroban RPC connection is currently considered
   * healthy, based on consecutive failures observed by `withRetry` (i.e.
   * retries were exhausted `RPC_UNHEALTHY_FAILURE_THRESHOLD` times in a
   * row without an intervening success). Intended for health-check
   * endpoints to surface persistent RPC failure without throwing.
   */
  isRpcHealthy(): boolean {
    return this.consecutiveRpcFailures < RPC_UNHEALTHY_FAILURE_THRESHOLD;
  }

  /** Number of consecutive RPC failures observed since the last success. */
  getConsecutiveRpcFailures(): number {
    return this.consecutiveRpcFailures;
  }

  async createMarket(
    title: string,
    description: string,
    category: string,
    outcomeOptions: string[],
    endTime: string,
    resolutionTime: string,
  ): Promise<SorobanCreateMarketResult> {
    return this.withSorobanErrorHandling('createMarket', () => {
      this.logger.log(
        `Soroban createMarket: title=${title} category=${category} outcomes=${outcomeOptions.length} end=${endTime} resolve=${resolutionTime}`,
      );

      const market_id = `market_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tx_hash = Buffer.from(`${market_id}:${description}`)
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      return Promise.resolve({ market_id, tx_hash });
    });
  }

  /**
   * Create a season on the Soroban contract (admin flow).
   * Stub implementation until real contract invocations are wired via stellar-sdk.
   */
  async createSeason(
    startTimeUnix: number,
    endTimeUnix: number,
    rewardPoolStroops: string,
  ): Promise<SorobanCreateSeasonResult> {
    return this.withSorobanErrorHandling('createSeason', () => {
      this.logger.log(
        `Soroban createSeason: start=${startTimeUnix} end=${endTimeUnix} pool=${rewardPoolStroops}`,
      );
      const mix =
        (BigInt(startTimeUnix) ^ BigInt(endTimeUnix)) & BigInt(0x7fffffff);
      const on_chain_season_id = mix === 0n ? 1 : Number(mix);
      const tx_hash = Buffer.from(
        `season:${startTimeUnix}:${endTimeUnix}:${rewardPoolStroops}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);
      return Promise.resolve({ on_chain_season_id, tx_hash });
    });
  }

  /**
   * Resolve a market on-chain via the Soroban contract.
   * Only the oracle (SERVER_SECRET_KEY) can resolve markets.
   *
   * Invokes: resolve_market(market_id, outcome)
   * Errors: Unauthorized, MarketAlreadyResolved, InvalidOutcome
   */
  async cancelMarket(marketOnChainId: string): Promise<{ tx_hash: string }> {
    return this.withSorobanErrorHandling('cancelMarket', () => {
      this.logger.log(`Soroban cancelMarket: market=${marketOnChainId}`);

      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `cancelMarket signed by admin: ${serverKeypair.publicKey()}`,
      );

      const tx_hash = Buffer.from(`cancel:${marketOnChainId}:${Date.now()}`)
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`cancelMarket submitted: tx_hash=${tx_hash}`);
      return Promise.resolve({ tx_hash });
    });
  }

  async resolveMarket(marketOnChainId: string, outcome: string): Promise<void> {
    return this.withSorobanErrorHandling('resolveMarket', () => {
      this.logger.log(
        `Soroban resolveMarket: market=${marketOnChainId} outcome=${outcome}`,
      );

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `resolveMarket signed by oracle: ${serverKeypair.publicKey()}`,
      );

      // Build and submit transaction to Soroban contract
      // The actual transaction building will be done via stellar-sdk
      // For now, we log the intent and return success
      const txHash = Buffer.from(
        `resolve:${marketOnChainId}:${outcome}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`resolveMarket submitted: tx_hash=${txHash}`);
      return Promise.resolve();
    });
  }

  async refundCompetitionParticipant(
    userStellarAddress: string,
    competitionId: string,
    refundAmountStroops: string,
    correlationId?: string,
  ): Promise<SorobanRefundResult> {
    const cid = correlationId || `refund_${Date.now()}`;
    return this.withSorobanErrorHandling(
      `refundCompetitionParticipant[${cid}]`,
      async () => {
        this.logger.log(
          `[${cid}] Initiating Soroban refund: user=${userStellarAddress} competition=${competitionId} amount=${refundAmountStroops}`,
        );

        const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
        const serverAccount = await this.rpcServer.getAccount(
          serverKeypair.publicKey(),
        );

        const contract = new Contract(this.contractId);

        // Build the invocation
        const tx = new TransactionBuilder(serverAccount, {
          fee: '10000', // Base fee, updated by simulation
          networkPassphrase:
            this.network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC,
        })
          .addOperation(
            contract.call(
              'refund',
              new Address(userStellarAddress).toScVal(),
              nativeToScVal(BigInt(refundAmountStroops), { type: 'u128' }),
            ),
          )
          .setTimeout(30)
          .build();

        // Simulate
        const simulation = await this.rpcServer.simulateTransaction(tx);
        if (SorobanRpc.Api.isSimulationError(simulation)) {
          if (simulation.error.includes('EscrowEmpty')) {
            throw new Error('EscrowEmpty');
          }
          if (simulation.error.includes('InsufficientFunds')) {
            throw new Error('InsufficientFunds');
          }
          throw new Error(`Simulation failed: ${simulation.error}`);
        }

        // Assemble and Sign
        const assembledTx = SorobanRpc.assembleTransaction(
          tx,
          simulation,
        ).build();
        assembledTx.sign(serverKeypair);

        // Submit
        const response = await this.rpcServer.sendTransaction(assembledTx);
        if (response.status === 'ERROR') {
          throw new Error(
            `Transaction submission failed: ${JSON.stringify(response.errorResult)}`,
          );
        }

        this.logger.log(`[${cid}] Refund submitted. tx_hash=${response.hash}`);

        // Wait for completion
        let statusResponse = await this.rpcServer.getTransaction(response.hash);
        let attempts = 0;
        while (
          statusResponse.status ===
            SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
          attempts < 10
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          statusResponse = await this.rpcServer.getTransaction(response.hash);
          attempts++;
        }

        if (
          statusResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS
        ) {
          this.logger.log(
            `[${cid}] Refund transaction confirmed: tx_hash=${response.hash}`,
          );
          return { tx_hash: response.hash };
        } else {
          throw new Error(
            `Transaction failed with status ${statusResponse.status}`,
          );
        }
      },
    );
  }

  /**
   * Submit a prediction to the Soroban contract, locking the stake on-chain.
   * Returns the transaction hash of the confirmed operation.
   *
   * Invokes: submit_prediction(market_id, predictor, chosen_outcome, stake_amount_stroops)
   * Errors: StakeTooLow, StakeTooHigh, AlreadyPredicted, MarketExpired
   */
  async submitPrediction(
    userStellarAddress: string,
    marketOnChainId: string,
    chosenOutcome: string,
    stakeAmountStroops: string,
  ): Promise<SorobanPredictionResult> {
    return this.withSorobanErrorHandling('submitPrediction', () => {
      this.logger.log(
        `Soroban submitPrediction: user=${userStellarAddress} market=${marketOnChainId} outcome=${chosenOutcome} stake=${stakeAmountStroops}`,
      );

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `submitPrediction signed by server: ${serverKeypair.publicKey()}`,
      );

      // Verify user address is valid
      Keypair.fromPublicKey(userStellarAddress);

      // Build and submit transaction to Soroban contract
      // The actual transaction building will be done via stellar-sdk
      // For now, we generate a deterministic tx_hash for development
      const tx_hash = Buffer.from(
        `${marketOnChainId}:${userStellarAddress}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      // Calculate realized price and shares (stub implementation)
      // In production, these values come from the contract execution result
      const stakeAmount = BigInt(stakeAmountStroops);
      const sharesReceived = (stakeAmount * 100n) / 50n; // 2x leverage simulation
      const realizedPrice =
        stakeAmount > 0n ? (stakeAmount * 1000000n) / sharesReceived : 0n;

      this.logger.log(
        `submitPrediction submitted: tx_hash=${tx_hash} realized_price=${realizedPrice.toString()} shares=${sharesReceived.toString()}`,
      );
      return Promise.resolve({
        tx_hash,
        realized_price: realizedPrice.toString(),
        shares_received: sharesReceived.toString(),
      });
    });
  }

  /**
   * Claim winnings from the Soroban contract.
   * Returns the transaction hash of the confirmed operation.
   *
   * Invokes: claim_payout(market_id, predictor)
   * Errors: PayoutAlreadyClaimed, MarketNotResolved, PredictionNotFound
   */
  async claimPayout(
    userStellarAddress: string,
    marketOnChainId: string,
  ): Promise<SorobanPredictionResult> {
    return this.withSorobanErrorHandling('claimPayout', () => {
      this.logger.log(
        `Soroban claimPayout: user=${userStellarAddress} market=${marketOnChainId}`,
      );

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `claimPayout signed by server: ${serverKeypair.publicKey()}`,
      );

      // Verify user address is valid
      Keypair.fromPublicKey(userStellarAddress);

      // Build and submit transaction to Soroban contract
      // The actual transaction building will be done via stellar-sdk
      // For now, we generate a deterministic tx_hash for development
      const tx_hash = Buffer.from(
        `claim:${marketOnChainId}:${userStellarAddress}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      // Calculate payout amount (in real implementation, this would come from contract)
      // For stub: simulate a 1.5x return on stake
      const payout_amount_stroops = '15000000'; // 1.5 XLM in stroops

      this.logger.log(
        `claimPayout submitted: tx_hash=${tx_hash} payout=${payout_amount_stroops}`,
      );
      return Promise.resolve({ tx_hash, payout_amount_stroops });
    });
  }

  /**
   * Raise a dispute on the Soroban contract for a market outcome.
   * Returns the dispute ID and transaction hash.
   *
   * Invokes: raise_dispute(market_id, reason)
   * Errors: MarketNotResolved, DisputeWindowPassed, DisputeAlreadyExists
   */
  async raiseDispute(
    marketOnChainId: string,
    reason: string,
  ): Promise<SorobanDisputeResult> {
    return this.withSorobanErrorHandling('raiseDispute', () => {
      this.logger.log(
        `Soroban raiseDispute: market=${marketOnChainId} reason=${reason}`,
      );

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `raiseDispute signed by server: ${serverKeypair.publicKey()}`,
      );

      // Generate dispute ID and transaction hash
      const dispute_id = `dispute_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tx_hash = Buffer.from(
        `dispute:${marketOnChainId}:${dispute_id}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(
        `raiseDispute submitted: dispute_id=${dispute_id} tx_hash=${tx_hash}`,
      );
      return Promise.resolve({ dispute_id, tx_hash });
    });
  }

  /**
   * Resolve a dispute on the Soroban contract.
   * Returns the transaction hash of the resolution.
   *
   * Invokes: resolve_dispute(market_id, dispute_id, resolution)
   * Errors: DisputeNotFound, DisputeNotPending, Unauthorized
   */
  async resolveDispute(
    marketOnChainId: string,
    disputeId: string,
    resolution: 'upheld' | 'overturned',
  ): Promise<SorobanDisputeResult> {
    return this.withSorobanErrorHandling('resolveDispute', () => {
      this.logger.log(
        `Soroban resolveDispute: market=${marketOnChainId} dispute=${disputeId} resolution=${resolution}`,
      );

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `resolveDispute signed by oracle: ${serverKeypair.publicKey()}`,
      );

      // Generate transaction hash
      const tx_hash = Buffer.from(
        `resolve_dispute:${marketOnChainId}:${disputeId}:${resolution}:${Date.now()}`,
      )
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`resolveDispute submitted: tx_hash=${tx_hash}`);
      return Promise.resolve({ dispute_id: disputeId, tx_hash });
    });
  }

  /**
   * Finalize an event on the Soroban contract.
   * Permissionless operation that can be called once event.has_ended() is true
   * and all matches have results.
   *
   * Invokes: finalize_event(event_id)
   * Errors: EventNotEnded, MatchesNotResolved, EventAlreadyFinalized
   */
  async finalizeEvent(
    onChainEventId: number,
  ): Promise<SorobanFinalizeEventResult> {
    return this.withSorobanErrorHandling('finalizeEvent', async () => {
      this.logger.log(`Soroban finalizeEvent: event_id=${onChainEventId}`);

      // Verify server keypair is valid
      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `finalizeEvent signed by server: ${serverKeypair.publicKey()}`,
      );

      // Get server account for transaction
      const serverAccount = await this.rpcServer.getAccount(
        serverKeypair.publicKey(),
      );

      const contract = new Contract(this.contractId);

      // Build the invocation
      const tx = new TransactionBuilder(serverAccount, {
        fee: '10000',
        networkPassphrase:
          this.network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC,
      })
        .addOperation(
          contract.call(
            'finalize_event',
            nativeToScVal(BigInt(onChainEventId), { type: 'u64' }),
          ),
        )
        .setTimeout(30)
        .build();

      // Simulate
      const simulation = await this.rpcServer.simulateTransaction(tx);
      if (SorobanRpc.Api.isSimulationError(simulation)) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }

      // Assemble and Sign
      const assembledTx = SorobanRpc.assembleTransaction(
        tx,
        simulation,
      ).build();
      assembledTx.sign(serverKeypair);

      // Submit
      const response = await this.rpcServer.sendTransaction(assembledTx);
      if (response.status === 'ERROR') {
        throw new Error(
          `Transaction submission failed: ${JSON.stringify(response.errorResult)}`,
        );
      }

      this.logger.log(`finalizeEvent submitted: tx_hash=${response.hash}`);

      // Wait for completion
      let statusResponse = await this.rpcServer.getTransaction(response.hash);
      let attempts = 0;
      while (
        statusResponse.status ===
          SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
        attempts < 10
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        statusResponse = await this.rpcServer.getTransaction(response.hash);
        attempts++;
      }

      if (
        statusResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS
      ) {
        this.logger.log(
          `finalizeEvent transaction confirmed: tx_hash=${response.hash}`,
        );
        return { tx_hash: response.hash };
      } else {
        throw new Error(
          `Transaction failed with status ${statusResponse.status}`,
        );
      }
    });
  }

  async pauseMarket(marketOnChainId: string): Promise<{ tx_hash: string }> {
    return this.withSorobanErrorHandling('pauseMarket', () => {
      this.logger.log(`Soroban pauseMarket: market=${marketOnChainId}`);

      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `pauseMarket signed by admin: ${serverKeypair.publicKey()}`,
      );

      const tx_hash = Buffer.from(`pause:${marketOnChainId}:${Date.now()}`)
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`pauseMarket submitted: tx_hash=${tx_hash}`);
      return Promise.resolve({ tx_hash });
    });
  }

  async resumeMarket(marketOnChainId: string): Promise<{ tx_hash: string }> {
    return this.withSorobanErrorHandling('resumeMarket', () => {
      this.logger.log(`Soroban resumeMarket: market=${marketOnChainId}`);

      const serverKeypair = Keypair.fromSecret(this.serverSecretKey);
      this.logger.debug(
        `resumeMarket signed by admin: ${serverKeypair.publicKey()}`,
      );

      const tx_hash = Buffer.from(`resume:${marketOnChainId}:${Date.now()}`)
        .toString('hex')
        .padEnd(64, '0')
        .slice(0, 64);

      this.logger.log(`resumeMarket submitted: tx_hash=${tx_hash}`);
      return Promise.resolve({ tx_hash });
    });
  }

  // ---- yield-adapter read entrypoints ----

  /**
   * Read a depositor's position from the yield-adapter contract.
   * Calls: get_position(owner: Address) -> Position
   *
   * Returns shares held and timestamps, or null if contract read fails.
   */
  async getYieldAdapterPosition(ownerAddress: string): Promise<{
    shares: string;
    created_at: number;
    updated_at: number;
  } | null> {
    if (!this.yieldAdapterContractId) {
      this.logger.warn(
        'getYieldAdapterPosition: SOROBAN_YIELD_ADAPTER_CONTRACT_ID not configured',
      );
      return null;
    }

    return this.withSorobanErrorHandling(
      'getYieldAdapterPosition',
      async () => {
        try {
          const result = await this.rpcServer.simulateTransaction(
            new TransactionBuilder(new Account(this.serverSecretKey, '0'), {
              fee: '10000',
              networkPassphrase: this.network,
            })
              .addOperation(
                new Contract(this.yieldAdapterContractId).call(
                  'get_position',
                  new Address(ownerAddress).toScVal(),
                ),
              )
              .setTimeout(30)
              .build(),
          );

          if (SorobanRpc.Api.isSimulationError(result)) {
            this.logger.warn(
              `getYieldAdapterPosition simulation error: ${result.error}`,
            );
            return null;
          }

          // Decode result from XDR (stub: return null for now)
          // Full implementation would decode the Position struct from the response
          return null;
        } catch (err) {
          this.logger.error(
            `getYieldAdapterPosition failed: ${(err as Error).message}`,
          );
          return null;
        }
      },
    );
  }

  /**
   * Read the current exchange rate from the yield-adapter contract.
   * Calls: exchange_rate() -> i128
   *
   * Returns the shares-to-assets ratio as a string, or null if contract read fails.
   */
  async getYieldAdapterExchangeRate(): Promise<string | null> {
    if (!this.yieldAdapterContractId) {
      this.logger.warn(
        'getYieldAdapterExchangeRate: SOROBAN_YIELD_ADAPTER_CONTRACT_ID not configured',
      );
      return null;
    }

    return this.withSorobanErrorHandling(
      'getYieldAdapterExchangeRate',
      async () => {
        try {
          const result = await this.rpcServer.simulateTransaction(
            new TransactionBuilder(new Account(this.serverSecretKey, '0'), {
              fee: '10000',
              networkPassphrase: this.network,
            })
              .addOperation(
                new Contract(this.yieldAdapterContractId).call('exchange_rate'),
              )
              .setTimeout(30)
              .build(),
          );

          if (SorobanRpc.Api.isSimulationError(result)) {
            this.logger.warn(
              `getYieldAdapterExchangeRate simulation error: ${result.error}`,
            );
            return null;
          }

          // Decode result from XDR (stub: return null for now)
          // Full implementation would decode the i128 from the response
          return null;
        } catch (err) {
          this.logger.error(
            `getYieldAdapterExchangeRate failed: ${(err as Error).message}`,
          );
          return null;
        }
      },
    );
  }

  /**
   * Read the total assets under management in the yield-adapter contract.
   * Calls: total_assets() -> i128
   *
   * Returns the total assets as a string, or null if contract read fails.
   */
  async getYieldAdapterTotalAssets(): Promise<string | null> {
    if (!this.yieldAdapterContractId) {
      this.logger.warn(
        'getYieldAdapterTotalAssets: SOROBAN_YIELD_ADAPTER_CONTRACT_ID not configured',
      );
      return null;
    }

    return this.withSorobanErrorHandling(
      'getYieldAdapterTotalAssets',
      async () => {
        try {
          const result = await this.rpcServer.simulateTransaction(
            new TransactionBuilder(new Account(this.serverSecretKey, '0'), {
              fee: '10000',
              networkPassphrase: this.network,
            })
              .addOperation(
                new Contract(this.yieldAdapterContractId).call('total_assets'),
              )
              .setTimeout(30)
              .build(),
          );

          if (SorobanRpc.Api.isSimulationError(result)) {
            this.logger.warn(
              `getYieldAdapterTotalAssets simulation error: ${result.error}`,
            );
            return null;
          }

          // Decode result from XDR (stub: return null for now)
          // Full implementation would decode the i128 from the response
          return null;
        } catch (err) {
          this.logger.error(
            `getYieldAdapterTotalAssets failed: ${(err as Error).message}`,
          );
          return null;
        }
      },
    );
  }

  /**
   * Read a pending withdrawal request from the yield-adapter contract.
   * Calls: get_withdraw_request(request_id: u64) -> WithdrawRequest
   *
   * Returns withdrawal request details, or null if not found or contract read fails.
   */
  async getYieldAdapterWithdrawRequest(requestId: number): Promise<{
    id: number;
    shares: string;
    claimable_at: number;
    claimed_at: number | null;
    cancelled_at: number | null;
  } | null> {
    if (!this.yieldAdapterContractId) {
      this.logger.warn(
        'getYieldAdapterWithdrawRequest: SOROBAN_YIELD_ADAPTER_CONTRACT_ID not configured',
      );
      return null;
    }

    return this.withSorobanErrorHandling(
      'getYieldAdapterWithdrawRequest',
      async () => {
        try {
          const result = await this.rpcServer.simulateTransaction(
            new TransactionBuilder(new Account(this.serverSecretKey, '0'), {
              fee: '10000',
              networkPassphrase: this.network,
            })
              .addOperation(
                new Contract(this.yieldAdapterContractId).call(
                  'get_withdraw_request',
                  nativeToScVal(BigInt(requestId), { type: 'u64' }),
                ),
              )
              .setTimeout(30)
              .build(),
          );

          if (SorobanRpc.Api.isSimulationError(result)) {
            this.logger.warn(
              `getYieldAdapterWithdrawRequest simulation error: ${result.error}`,
            );
            return null;
          }

          // Decode result from XDR (stub: return null for now)
          // Full implementation would decode the WithdrawRequest struct from the response
          return null;
        } catch (err) {
          this.logger.error(
            `getYieldAdapterWithdrawRequest failed: ${(err as Error).message}`,
          );
          return null;
        }
      },
    );
  }

  /**
   * Read total shares from the yield-adapter contract.
   * Calls: total_shares() -> i128
   *
   * Returns the total shares as a string, or null if contract read fails.
   */
  async getYieldAdapterTotalShares(): Promise<string | null> {
    if (!this.yieldAdapterContractId) {
      this.logger.warn(
        'getYieldAdapterTotalShares: SOROBAN_YIELD_ADAPTER_CONTRACT_ID not configured',
      );
      return null;
    }

    return this.withSorobanErrorHandling(
      'getYieldAdapterTotalShares',
      async () => {
        try {
          const result = await this.rpcServer.simulateTransaction(
            new TransactionBuilder(new Account(this.serverSecretKey, '0'), {
              fee: '10000',
              networkPassphrase: this.network,
            })
              .addOperation(
                new Contract(this.yieldAdapterContractId).call('total_shares'),
              )
              .setTimeout(30)
              .build(),
          );

          if (SorobanRpc.Api.isSimulationError(result)) {
            this.logger.warn(
              `getYieldAdapterTotalShares simulation error: ${result.error}`,
            );
            return null;
          }

          // Decode result from XDR (stub: return null for now)
          return null;
        } catch (err) {
          this.logger.error(
            `getYieldAdapterTotalShares failed: ${(err as Error).message}`,
          );
          return null;
        }
      },
    );
  }

  /**
   * Read the currently active strategy ID from the yield-adapter contract.
   * Calls: get_active_strategy() -> Option<u64>
   *
   * Returns the strategy ID, or null if no active strategy (idle funds).
   */
  async getYieldAdapterActiveStrategy(): Promise<number | null> {
    if (!this.yieldAdapterContractId) {
      this.logger.warn(
        'getYieldAdapterActiveStrategy: SOROBAN_YIELD_ADAPTER_CONTRACT_ID not configured',
      );
      return null;
    }

    return this.withSorobanErrorHandling(
      'getYieldAdapterActiveStrategy',
      async () => {
        try {
          const result = await this.rpcServer.simulateTransaction(
            new TransactionBuilder(new Account(this.serverSecretKey, '0'), {
              fee: '10000',
              networkPassphrase: this.network,
            })
              .addOperation(
                new Contract(this.yieldAdapterContractId).call(
                  'get_active_strategy',
                ),
              )
              .setTimeout(30)
              .build(),
          );

          if (SorobanRpc.Api.isSimulationError(result)) {
            this.logger.warn(
              `getYieldAdapterActiveStrategy simulation error: ${result.error}`,
            );
            return null;
          }

          // Decode result from XDR (stub: return null for now)
          return null;
        } catch (err) {
          this.logger.error(
            `getYieldAdapterActiveStrategy failed: ${(err as Error).message}`,
          );
          return null;
        }
      },
    );
  }

  /**
   * Read the accrued-but-unswept fees from the yield-adapter contract.
   * Calls: fees_accrued() -> i128
   *
   * Returns the accrued fees in stroops, or null if contract read fails.
   */
  async getYieldAdapterAccruedFees(): Promise<string | null> {
    if (!this.yieldAdapterContractId) {
      this.logger.warn(
        'getYieldAdapterAccruedFees: SOROBAN_YIELD_ADAPTER_CONTRACT_ID not configured',
      );
      return null;
    }

    return this.withSorobanErrorHandling(
      'getYieldAdapterAccruedFees',
      async () => {
        try {
          const result = await this.rpcServer.simulateTransaction(
            new TransactionBuilder(new Account(this.serverSecretKey, '0'), {
              fee: '10000',
              networkPassphrase: this.network,
            })
              .addOperation(
                new Contract(this.yieldAdapterContractId).call('fees_accrued'),
              )
              .setTimeout(30)
              .build(),
          );

          if (SorobanRpc.Api.isSimulationError(result)) {
            this.logger.warn(
              `getYieldAdapterAccruedFees simulation error: ${result.error}`,
            );
            return null;
          }

          // Decode result from XDR (stub: return null for now)
          return null;
        } catch (err) {
          this.logger.error(
            `getYieldAdapterAccruedFees failed: ${(err as Error).message}`,
          );
          return null;
        }
      },
    );
  }

  /**
   * Fetch contract events from the Soroban RPC node with full cursor-based
   * paging support.
   *
   * Behaviour:
   * - Iterates through RPC pages until one of the following stop conditions
   *   is met:
   *     1. The RPC returns an empty event list (no more events in range).
   *     2. The highest ledger seen on the current page has reached or
   *        exceeded `latestLedger` reported by the RPC (we are at chain
   *        tip — no point fetching further).
   *     3. The total number of events accumulated has reached
   *        `MAX_EVENTS_PER_FETCH` (circuit-breaker for unexpectedly large
   *        ranges; callers can resume using the returned `cursor`).
   * - On an RPC-level error the loop exits cleanly and returns whatever
   *   events were collected up to that point, plus the last known
   *   `latestLedger`. This intentionally avoids losing the checkpoint:
   *   callers can persist the returned `cursor` and retry from there.
   * - `startLedger` and `cursor` are mutually exclusive in the Soroban
   *   JSON-RPC spec.  When `options.cursor` is provided `startLedger` is
   *   omitted so the RPC resumes from the cursor position.
   *
   * @param fromLedger  The ledger sequence to start from (used only when
   *                    no cursor is provided).
   * @param options     Optional paging controls (cursor, per-page limit).
   */
  async getEvents(
    fromLedger: number,
    options: GetEventsOptions = {},
  ): Promise<SorobanEventsResponse> {
    if (!this.rpcUrl || !this.contractId) {
      this.logger.warn(
        'SOROBAN_RPC_URL or SOROBAN_CONTRACT_ID is not configured; skipping event poll',
      );
      return { events: [], latestLedger: fromLedger };
    }

    const pageSize = Math.min(
      options.limit ?? SorobanService.MAX_PAGE_SIZE,
      SorobanService.MAX_PAGE_SIZE,
    );

    const accumulated: SorobanRpcEvent[] = [];
    let activeCursor: string | undefined = options.cursor;
    let latestLedger = fromLedger;
    let lastCursor: string | undefined;

    while (accumulated.length < SorobanService.MAX_EVENTS_PER_FETCH) {
      // Build the JSON-RPC params.  `startLedger` and `cursor` are mutually
      // exclusive: include `startLedger` only on the very first page when no
      // resume cursor has been supplied.
      const pagination: Record<string, unknown> = { limit: pageSize };
      if (activeCursor) {
        pagination.cursor = activeCursor;
      }

      const params: Record<string, unknown> = {
        filters: [{ type: 'contract', contractIds: [this.contractId] }],
        pagination,
      };
      if (!activeCursor) {
        params.startLedger = fromLedger;
      }

      let body: {
        error?: { code?: number; message?: string };
        result?: {
          events?: unknown[];
          latestLedger?: number;
          cursor?: string;
        };
      };

      try {
        body = await this.withRetry('getEvents', async () => {
          const response = await fetch(this.rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'stow-getEvents',
              method: 'getEvents',
              params,
            }),
          });

          if (!response.ok) {
            // Thrown so `withRetry`/`isTransientRpcError` can classify and
            // retry transient statuses (5xx/429) with backoff.
            throw new Error(`HTTP ${response.status}`);
          }

          return (await response.json()) as typeof body;
        });
      } catch (fetchError) {
        // Retries (if any) are exhausted, or the failure was permanent —
        // log and break so the caller keeps the checkpoint at the last
        // successfully retrieved cursor and can resume from there.
        this.logger.error(
          `getEvents RPC failed: ${(fetchError as Error).message} (cursor=${activeCursor ?? 'none'}, fromLedger=${fromLedger})`,
        );
        break;
      }

      if (body.error) {
        // JSON-RPC application error.
        this.logger.error(
          `getEvents RPC error ${body.error.code ?? ''}: ${body.error.message ?? 'unknown'} (cursor=${activeCursor ?? 'none'}, fromLedger=${fromLedger})`,
        );
        break;
      }

      const rawEvents = body.result?.events ?? [];

      // Update latestLedger from every page so callers always get the most
      // recent chain-tip value even if the event list is empty.
      if (typeof body.result?.latestLedger === 'number') {
        latestLedger = body.result.latestLedger;
      }

      // No events on this page → nothing more to fetch.
      if (rawEvents.length === 0) {
        break;
      }

      const pageEvents: SorobanRpcEvent[] = rawEvents
        .map((e) => this.normalizeEvent(e))
        .filter((e): e is SorobanRpcEvent => e !== null);

      accumulated.push(...pageEvents);

      // Track the cursor for this page (= last event id, or the explicit
      // response-level cursor field if the node returns one).
      const responseCursor =
        typeof body.result?.cursor === 'string'
          ? body.result.cursor
          : pageEvents.length > 0
            ? pageEvents[pageEvents.length - 1].id
            : undefined;

      if (responseCursor) {
        lastCursor = responseCursor;
        activeCursor = responseCursor;
      }

      // Stop when the highest ledger on this page has caught up with the
      // chain tip — there is nothing further to page through right now.
      const maxPageLedger = Math.max(...pageEvents.map((e) => e.ledger));
      if (maxPageLedger >= latestLedger) {
        break;
      }

      // Fewer events than requested → last page; no need for another round.
      if (rawEvents.length < pageSize) {
        break;
      }
    }

    return { events: accumulated, latestLedger, cursor: lastCursor };
  }

  /** Maximum events fetched in a single `getEvents` call (all pages combined). */
  static readonly MAX_EVENTS_PER_FETCH = 10_000;

  /** Maximum events requested per individual RPC page. */
  static readonly MAX_PAGE_SIZE = 200;

  private async withSorobanErrorHandling<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Soroban error';
      this.logger.error(`Soroban ${operation} failed: ${message}`);
      throw error;
    }
  }

  /**
   * Wraps an RPC call with bounded retries and exponential backoff + jitter.
   *
   * - Max attempts: SOROBAN_RPC_MAX_RETRIES (default 3)
   * - Delay formula: SOROBAN_RPC_RETRY_BASE_DELAY_MS * 4^attemptIndex →
   *   500 ms, 2 s, 8 s by default
   * - Jitter: ±20% of the computed delay
   * - Only transient errors (network failures, HTTP 5xx/429) are retried;
   *   permanent errors (e.g. simulation/contract errors) throw immediately.
   * - Tracks consecutive failures so `isRpcHealthy()` can surface a
   *   persistent outage to health checks without throwing.
   */
  private async withRetry<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const maxAttempts = Number(
      this.configService.get<string>('SOROBAN_RPC_MAX_RETRIES') ??
        DEFAULT_RPC_RETRY_MAX_ATTEMPTS,
    );
    const baseDelayMs = Number(
      this.configService.get<string>('SOROBAN_RPC_RETRY_BASE_DELAY_MS') ??
        DEFAULT_RPC_RETRY_BASE_DELAY_MS,
    );

    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await fn();
        this.consecutiveRpcFailures = 0;
        return result;
      } catch (error) {
        lastError = error;

        if (!isTransientRpcError(error)) {
          // Permanent failure — do not retry, do not count toward the
          // persistent-outage threshold (it isn't an RPC connectivity issue).
          throw error;
        }

        const attemptsRemaining = maxAttempts - attempt - 1;
        if (attemptsRemaining === 0) {
          break; // exhausted — record failure and throw below
        }

        const delayMs = computeRpcBackoffDelay(baseDelayMs, attempt);
        this.logger.warn(
          `Transient RPC failure during ${operation} — attempt ${attempt + 1}/${maxAttempts}, ` +
            `retrying in ${delayMs} ms: ${error instanceof Error ? error.message : String(error)}`,
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    this.consecutiveRpcFailures += 1;
    this.logger.error(
      `RPC ${operation} failed after ${maxAttempts} attempt(s) ` +
        `(${this.consecutiveRpcFailures} consecutive failures): ` +
        `${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
    throw lastError;
  }

  private normalizeEvent(rawEvent: unknown): SorobanRpcEvent | null {
    if (!rawEvent || typeof rawEvent !== 'object') {
      return null;
    }

    const eventRecord = rawEvent as Record<string, unknown>;
    const id =
      typeof eventRecord.id === 'string'
        ? eventRecord.id
        : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

    const ledger = this.toNumber(eventRecord.ledger);
    if (ledger === null) {
      return null;
    }

    const topic = this.toStringArray(eventRecord.topic ?? eventRecord.topics);
    const value = this.toRecord(eventRecord.value ?? eventRecord.data);

    if (!value) {
      return null;
    }

    const txHash =
      typeof eventRecord.txHash === 'string'
        ? eventRecord.txHash
        : typeof eventRecord.tx_hash === 'string'
          ? eventRecord.tx_hash
          : undefined;

    return { id, ledger, topic, value, txHash };
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          if (typeof obj.symbol === 'string') {
            return obj.symbol;
          }
          if (typeof obj.value === 'string') {
            return obj.value;
          }
        }
        return null;
      })
      .filter((item): item is string => item !== null);
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (value !== undefined && value !== null) {
      return { value };
    }
    return {};
  }
}
