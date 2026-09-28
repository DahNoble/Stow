"use client";

import { CSSProperties } from "react";

export interface YieldOptInCardProps {
  /** APR percentage offered */
  apr: number;
  /** Whether yield is currently enabled */
  isEnabled: boolean;
  /** Callback when user opts in/out */
  onToggle: (enabled: boolean) => void;
  /** Optional loading state */
  isLoading?: boolean;
}

export default function YieldOptInCard({
  apr,
  isEnabled,
  onToggle,
  isLoading = false,
}: YieldOptInCardProps) {
  const handleToggle = () => {
    if (!isLoading) {
      onToggle(!isEnabled);
    }
  };

  return (
    <article
      className="rounded-2xl border border-border bg-card p-6"
      aria-labelledby="yield-opt-in-title"
    >
      <header>
        <h2
          id="yield-opt-in-title"
          className="text-lg font-semibold"
        >
          Earn Yield
        </h2>
        <p className="mt-1 text-sm text-muted">
          Opt-in to earn {apr}% APR on idle balances
        </p>
      </header>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Annual Percentage Rate</p>
          <p
            className="text-2xl font-bold text-brand"
            aria-label={`${apr} percent APR`}
          >
            {apr}%
          </p>
        </div>

        <button
          onClick={handleToggle}
          disabled={isLoading}
          aria-pressed={isEnabled}
          aria-label={isEnabled ? "Disable yield" : "Enable yield"}
          className={`
            relative inline-flex h-10 w-16 items-center rounded-full
            transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            ${isEnabled ? "bg-brand" : "bg-muted"}
          `}
        >
          <span
            className={`
              inline-block h-8 w-8 transform rounded-full bg-white
              transition-transform
              ${isEnabled ? "translate-x-8" : "translate-x-1"}
            `}
            aria-hidden="true"
          />
          <span className="sr-only">
            {isEnabled ? "Yield is enabled" : "Yield is disabled"}
          </span>
        </button>
      </div>

      {isLoading && (
        <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">
          Updating...
        </p>
      )}
    </article>
  );
}
