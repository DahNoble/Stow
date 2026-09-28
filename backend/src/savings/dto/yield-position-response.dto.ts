/**
 * GET /savings/yield/position response.
 *
 * Returns the caller's shares, estimated asset value, and any pending withdrawal cooldown.
 */
export class YieldPositionResponseDto {
  /** Stellar account address of the position owner. */
  address: string;

  /** Number of shares held in the yield-adapter. */
  shares: string;

  /**
   * Estimated current asset value based on the last-known exchange rate snapshot.
   * Null if no exchange rate has been recorded yet.
   */
  estimated_asset_value: string | null;

  /** Last exchange rate snapshot used for estimation. Null if not yet set. */
  exchange_rate_snapshot: string | null;

  /**
   * If a withdrawal is pending: the ledger timestamp (Unix seconds) when
   * it becomes claimable. Null if no withdrawal is pending.
   */
  pending_withdrawal_claimable_at: number | null;

  /** Timestamp when this position was last updated from an on-chain event. */
  updated_at: Date;
}
