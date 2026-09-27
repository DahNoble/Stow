"use client";

import FeeDisclosure, { type FeeDisclosureProps } from "./FeeDisclosure";

export interface YieldOptInConfirmationProps {
  /** APR percentage offered */
  apr: number;
  /** Amount being deposited */
  amount: string;
  /** Fee disclosure props (contains performanceFeeBps) */
  feeDisclosure: FeeDisclosureProps;
  /** Callback when user confirms opt-in */
  onConfirm: () => void;
  /** Callback to cancel opt-in */
  onCancel: () => void;
  /** Optional loading state during submission */
  isLoading?: boolean;
}

export default function YieldOptInConfirmation({
  apr,
  amount,
  feeDisclosure,
  onConfirm,
  onCancel,
  isLoading = false,
}: YieldOptInConfirmationProps) {
  return (
    <article
      className="rounded-lg border border-border bg-card p-6 space-y-4"
      aria-labelledby="opt-in-confirmation-title"
    >
      <header>
        <h2
          id="opt-in-confirmation-title"
          className="text-lg font-semibold"
        >
          Enable Yield
        </h2>
        <p className="mt-1 text-sm text-muted">
          Review the terms before proceeding
        </p>
      </header>

      <section className="space-y-4 border-t border-border pt-4">
        <div className="rounded-lg bg-brand/5 p-3">
          <p className="text-sm text-muted">Amount to deposit</p>
          <p
            className="mt-1 text-2xl font-bold text-foreground"
            aria-label={`${amount} USDC`}
          >
            {amount} USDC
          </p>
        </div>

        <div className="rounded-lg bg-brand/5 p-3">
          <p className="text-sm text-muted">Annual Percentage Rate</p>
          <p
            className="mt-1 text-2xl font-bold text-brand"
            aria-label={`${apr}% APR`}
          >
            {apr}%
          </p>
        </div>

        <FeeDisclosure
          performanceFeeBps={feeDisclosure.performanceFeeBps}
          isLoading={feeDisclosure.isLoading}
          error={feeDisclosure.error}
        />

        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
          <p className="text-xs font-medium text-blue-900">Key Points</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-blue-800">
            <li>Your principal balance is always protected</li>
            <li>Only positive yield is subject to the performance fee</li>
            <li>You can disable yield at any time</li>
            <li>Strategy may change as we add more venues</li>
          </ul>
        </div>
      </section>

      <div className="flex gap-3 border-t border-border pt-4">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Cancel yield opt-in"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Confirm yield opt-in"
        >
          {isLoading ? "Confirming..." : "Confirm & Enable"}
        </button>
      </div>

      {isLoading && (
        <p
          className="text-xs text-muted text-center"
          role="status"
          aria-live="polite"
        >
          Processing your request...
        </p>
      )}
    </article>
  );
}
