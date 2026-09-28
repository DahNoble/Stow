"use client";

export interface FeeDisclosureProps {
  /** Performance fee in basis points (e.g., 2000 = 20%) */
  performanceFeeBps: number;
  /** Optional loading state while fetching on-chain data */
  isLoading?: boolean;
  /** Optional error state if on-chain data fetch fails */
  error?: string | null;
}

export default function FeeDisclosure({
  performanceFeeBps,
  isLoading = false,
  error = null,
}: FeeDisclosureProps) {
  const feePercentage = (performanceFeeBps / 10000) * 100;

  if (error) {
    return (
      <div
        className="rounded-lg border border-yellow-300 bg-yellow-50 p-4"
        role="alert"
        aria-label="Fee disclosure error"
      >
        <p className="text-sm font-medium text-yellow-800">Fee Information</p>
        <p className="mt-1 text-sm text-yellow-700">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-4"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-medium text-muted">Fee Information</p>
        <p className="mt-1 text-sm text-muted">Loading fee information...</p>
      </div>
    );
  }

  return (
    <article
      className="rounded-lg border border-border bg-card p-4"
      aria-labelledby="fee-disclosure-title"
    >
      <header>
        <h3
          id="fee-disclosure-title"
          className="text-sm font-semibold"
        >
          Performance Fee
        </h3>
      </header>

      <div className="mt-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-muted">Current fee on yield:</p>
          <p
            className="text-lg font-bold text-brand"
            aria-label={`${feePercentage}% performance fee`}
          >
            {feePercentage.toFixed(2)}%
          </p>
        </div>

        <div className="border-t border-border pt-2">
          <p className="text-xs text-muted leading-relaxed">
            This fee applies only to positive yield earned, never to your principal balance.
            You keep 100% of your initial deposit.
          </p>
        </div>
      </div>
    </article>
  );
}
