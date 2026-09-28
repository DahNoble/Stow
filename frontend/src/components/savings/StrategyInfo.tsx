"use client";

export interface StrategyInfoProps {
  /** Name of the active strategy (e.g., "Aave", "Compound") */
  strategyName: string;
  /** ISO timestamp string of when the strategy was activated */
  activatedAt: string;
  /** Optional loading state */
  isLoading?: boolean;
  /** Optional error state */
  error?: string | null;
}

export default function StrategyInfo({
  strategyName,
  activatedAt,
  isLoading = false,
  error = null,
}: StrategyInfoProps) {
  const formatDate = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  if (error) {
    return (
      <div
        className="rounded-lg border border-red-300 bg-red-50 p-3"
        role="alert"
        aria-label="Strategy information error"
      >
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-3"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-muted">Loading strategy information...</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-border bg-card p-3"
      aria-labelledby="strategy-label"
    >
      <div className="flex items-center justify-between">
        <div>
          <p id="strategy-label" className="text-xs font-medium text-muted">
            Active Strategy
          </p>
          <p
            className="mt-1 text-sm font-semibold"
            aria-label={`Strategy: ${strategyName}`}
          >
            {strategyName}
          </p>
        </div>
      </div>

      <div className="mt-2 border-t border-border pt-2">
        <p className="text-xs text-muted">Deployed</p>
        <p
          className="text-xs font-medium"
          aria-label={`Activated at ${formatDate(activatedAt)}`}
        >
          {formatDate(activatedAt)}
        </p>
      </div>
    </div>
  );
}
