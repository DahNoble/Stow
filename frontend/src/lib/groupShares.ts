/**
 * Group-split share math, mirroring the vault contract's `group_split.rs`.
 *
 * Shares are basis points (1 bps = 0.01%) and must sum to `TOTAL_BPS`.
 * Payouts are `pool * bps / TOTAL_BPS` (floor), with the rounding remainder
 * added to the remainder recipient (the group creator on-chain) so the
 * payouts always sum to the pool exactly.
 */

export const TOTAL_BPS = 10_000;

/** Splits `TOTAL_BPS` evenly; leftover bps go to the first addresses. */
export function equalSharesBps(addresses: string[]): Record<string, number> {
  const shares: Record<string, number> = {};
  if (addresses.length === 0) return shares;

  const base = Math.floor(TOTAL_BPS / addresses.length);
  let leftover = TOTAL_BPS - base * addresses.length;
  for (const address of addresses) {
    shares[address] = base + (leftover > 0 ? 1 : 0);
    if (leftover > 0) leftover -= 1;
  }
  return shares;
}

export function sumBps(shares: Record<string, number>): number {
  return Object.values(shares).reduce((total, bps) => total + bps, 0);
}

/** bps -> percent string with up to 2 decimals, e.g. 3333 -> "33.33". */
export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Parses a user-typed percent ("33.33") into bps. Returns `null` for input
 * that isn't a number in [0, 100] with at most 2 decimals.
 */
export function percentToBps(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(trimmed)) return null;
  const bps = Math.round(parseFloat(trimmed) * 100);
  if (!Number.isFinite(bps) || bps < 0 || bps > TOTAL_BPS) return null;
  return bps;
}

/**
 * Computes each member's payout in stroops for `pool` (a stroops string).
 * Uses BigInt so large i128 balances don't lose precision.
 */
export function computePayouts(
  pool: string,
  sharesBps: Record<string, number>,
  remainderRecipient: string,
): Record<string, bigint> {
  const poolBig = BigInt(pool || "0");
  const payouts: Record<string, bigint> = {};
  let distributed = BigInt(0);

  for (const [address, bps] of Object.entries(sharesBps)) {
    const amount = (poolBig * BigInt(bps)) / BigInt(TOTAL_BPS);
    payouts[address] = amount;
    distributed += amount;
  }

  const remainder = poolBig - distributed;
  if (remainder !== BigInt(0)) {
    payouts[remainderRecipient] =
      (payouts[remainderRecipient] ?? BigInt(0)) + remainder;
  }

  return payouts;
}
