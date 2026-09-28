import { formatStroopsAmount } from "@/lib/currency";
import YieldPositionCardSkeleton from "./YieldPositionCardSkeleton";

/**
 * Shape of the `GET /savings/yield/position` response
 * (see backend `YieldPositionResponseDto`). Amounts and shares are stroop
 * strings to avoid precision loss on i128 values.
 */
export interface YieldPosition {
  address: string;
  shares: string;
  /** Null until the backend has an exchange-rate snapshot. */
  estimated_asset_value: string | null;
  exchange_rate_snapshot: string | null;
  pending_withdrawal_claimable_at: number | null;
  updated_at: string;
  /**
   * Net yield earned over the position's lifetime, in stroops. Negative
   * after a net loss. Null/absent when not yet known.
   */
  lifetime_yield_earned?: string | null;
}

export interface YieldPositionCardProps {
  /** Null (or a position with zero shares) renders the empty state. */
  position: YieldPosition | null;
  assetCode?: string;
  className?: string;
  /** Callback when user clicks the call-to-action in empty state */
  onOptIn?: () => void;
  /** Whether the position data is currently being fetched */
  loading?: boolean;
}

/**
 * Shows the user's yield-adapter position: shares held, estimated asset
 * value, and lifetime yield earned.
 */
export default function YieldPositionCard({
  position,
  assetCode = "USDC",
  className = "",
  onOptIn,
  loading = false,
}: YieldPositionCardProps) {
  if (loading) {
    return <YieldPositionCardSkeleton className={className} />;
  }

  const hasPosition = position !== null && BigInt(position.shares || "0") > BigInt(0);

  if (!hasPosition) {
    return (
      <div
        data-testid="yield-position-card"
        className={`rounded-2xl border border-border bg-card p-6 ${className}`}
      >
        <h3 className="text-lg font-semibold text-foreground">Yield position</h3>
        <p data-testid="yield-position-empty" className="mt-1 text-sm text-muted">
          You don&apos;t have a yield position yet.
        </p>
        {onOptIn && (
          <button
            onClick={onOptIn}
            className="mt-4 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90"
            data-testid="yield-position-cta"
          >
            Enable Yield
          </button>
        )}
      </div>
    );
  }

  const lifetime = position.lifetime_yield_earned;
  const isLoss = lifetime != null && lifetime.startsWith("-");

  return (
    <div
      data-testid="yield-position-card"
      className={`rounded-2xl border border-border bg-card p-6 ${className}`}
    >
      <h3 className="text-lg font-semibold text-foreground">Yield position</h3>

      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted">Shares</dt>
          <dd data-testid="yield-position-shares" className="mt-1 text-xl font-semibold text-foreground">
            {formatStroopsAmount(position.shares)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Estimated value</dt>
          <dd data-testid="yield-position-value" className="mt-1 text-xl font-semibold text-foreground">
            {position.estimated_asset_value === null
              ? "—"
              : `${formatStroopsAmount(position.estimated_asset_value)} ${assetCode}`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Lifetime yield</dt>
          <dd
            data-testid="yield-position-lifetime"
            className={`mt-1 text-xl font-semibold ${
              lifetime == null ? "text-foreground" : isLoss ? "text-red-400" : "text-brand"
            }`}
          >
            {lifetime == null
              ? "—"
              : `${isLoss ? "−" : "+"}${formatStroopsAmount(lifetime.replace(/^-/, ""))} ${assetCode}`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
