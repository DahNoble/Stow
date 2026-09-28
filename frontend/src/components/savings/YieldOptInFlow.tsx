"use client";

import { useState, useCallback } from "react";
import YieldRiskDisclosure from "./YieldRiskDisclosure";
import YieldOptInConfirmation from "./YieldOptInConfirmation";
import { FeeDisclosureProps } from "./FeeDisclosure";

export type YieldOptInStep = "disclosure" | "amount" | "confirm" | "submit" | "success" | "error";

export interface YieldOptInFlowProps {
  /** Current APR percentage */
  apr: number;
  /** Fee disclosure data */
  feeDisclosure: FeeDisclosureProps;
  /** Callback to initiate the on-chain deposit transaction */
  onSignAndSubmit: (amount: string) => Promise<void>;
  /** Callback when flow completes successfully */
  onSuccess?: () => void;
  /** Callback when user cancels the flow at any step */
  onCancel: () => void;
  /** Optional initial step (for testing) */
  initialStep?: YieldOptInStep;
}

interface FlowState {
  step: YieldOptInStep;
  amount: string;
  hasSeenDisclosure: boolean;
  errorMessage: string | null;
}

/**
 * Multi-step yield opt-in flow:
 * 1. Risk Disclosure (first-time only)
 * 2. Amount Input
 * 3. Confirmation Review
 * 4. Sign/Submit Transaction
 * 5. Success or Error state
 */
export default function YieldOptInFlow({
  apr,
  feeDisclosure,
  onSignAndSubmit,
  onSuccess,
  onCancel,
  initialStep = "disclosure",
}: YieldOptInFlowProps) {
  const [state, setState] = useState<FlowState>({
    step: initialStep,
    amount: "",
    hasSeenDisclosure: false,
    errorMessage: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Handle disclosure acknowledgment
  const handleDisclosureAcknowledge = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: "amount",
      hasSeenDisclosure: true,
    }));
  }, []);

  // Step 2: Handle amount submission
  const handleAmountSubmit = useCallback((amount: string) => {
    setState((prev) => ({
      ...prev,
      step: "confirm",
      amount,
    }));
  }, []);

  // Step 3: Handle confirmation
  const handleConfirm = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: "submit",
    }));
  }, []);

  // Step 4: Handle sign and submit
  const handleSignAndSubmit = useCallback(async () => {
    setIsLoading(true);
    setState((prev) => ({
      ...prev,
      errorMessage: null,
    }));

    try {
      await onSignAndSubmit(state.amount);
      setState((prev) => ({
        ...prev,
        step: "success",
      }));
      onSuccess?.();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        step: "error",
        errorMessage:
          err instanceof Error
            ? err.message
            : "Transaction failed. Please try again.",
      }));
    } finally {
      setIsLoading(false);
    }
  }, [state.amount, onSignAndSubmit, onSuccess]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    setState((prev) => {
      switch (prev.step) {
        case "amount":
          return { ...prev, step: "disclosure" };
        case "confirm":
          return { ...prev, step: "amount" };
        case "error":
          return { ...prev, step: "confirm" };
        default:
          return prev;
      }
    });
  }, []);

  // Handle retry after error
  const handleRetry = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: "submit",
      errorMessage: null,
    }));
  }, []);

  // Render based on current step
  switch (state.step) {
    case "disclosure":
      return (
        <YieldRiskDisclosure
          onAcknowledge={handleDisclosureAcknowledge}
          onDecline={onCancel}
          isLoading={isLoading}
        />
      );

    case "amount":
      return (
        <YieldAmountInput
          apr={apr}
          onNext={handleAmountSubmit}
          onCancel={onCancel}
        />
      );

    case "confirm":
      return (
        <YieldOptInConfirmation
          apr={apr}
          amount={state.amount}
          feeDisclosure={feeDisclosure}
          onConfirm={handleConfirm}
          onCancel={handleBack}
          isLoading={isLoading}
        />
      );

    case "submit":
      return (
        <YieldSubmitting
          amount={state.amount}
          onSign={handleSignAndSubmit}
          onCancel={handleBack}
          isLoading={isLoading}
        />
      );

    case "success":
      return (
        <YieldOptInSuccess
          amount={state.amount}
          onDone={onCancel}
        />
      );

    case "error":
      return (
        <YieldOptInError
          message={state.errorMessage || "An unexpected error occurred"}
          onRetry={handleRetry}
          onCancel={onCancel}
        />
      );

    default:
      return null;
  }
}

// ============================================
// Sub-components for each step
// ============================================

interface YieldAmountInputProps {
  apr: number;
  onNext: (amount: string) => void;
  onCancel: () => void;
}

function YieldAmountInput({ apr, onNext, onCancel }: YieldAmountInputProps) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    onNext(amount);
  };

  return (
    <article
      className="rounded-2xl border border-border bg-card p-6"
      aria-labelledby="amount-input-title"
    >
      <header>
        <h2
          id="amount-input-title"
          className="text-lg font-semibold"
        >
          Deposit Amount
        </h2>
        <p className="mt-1 text-sm text-muted">
          Enter the amount to deposit into yield
        </p>
      </header>

      <div className="mt-4 rounded-lg bg-brand/5 p-3">
        <p className="text-sm text-muted">Annual Percentage Rate</p>
        <p className="mt-1 text-2xl font-bold text-brand">{apr}%</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="yield-amount"
            className="block text-sm font-medium text-foreground"
          >
            Amount (USDC)
          </label>
          <input
            id="yield-amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            placeholder="0.00"
            aria-invalid={!!error}
            aria-describedby={error ? "amount-error" : undefined}
          />
          {error && (
            <p id="amount-error" className="mt-1 text-sm text-red-500" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90"
          >
            Continue
          </button>
        </div>
      </form>
    </article>
  );
}

interface YieldSubmittingProps {
  amount: string;
  onSign: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function YieldSubmitting({ amount, onSign, onCancel, isLoading }: YieldSubmittingProps) {
  return (
    <article
      className="rounded-2xl border border-border bg-card p-6"
      aria-labelledby="submitting-title"
    >
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
          <svg
            className="h-8 w-8 text-brand animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 id="submitting-title" className="text-lg font-semibold">
          Review & Sign
        </h2>
        <p className="mt-1 text-sm text-muted">
          Review the transaction details
        </p>
      </header>

      <div className="mt-6 space-y-3 rounded-lg border border-border bg-background p-4">
        <div className="flex justify-between">
          <span className="text-sm text-muted">Amount</span>
          <span className="text-sm font-medium text-foreground">{amount} USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted">APY</span>
          <span className="text-sm font-medium text-brand">~5.5%</span>
        </div>
      </div>

      <div className="mt-6 space-y-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
        <p className="text-xs font-medium text-blue-900">Before you sign:</p>
        <ul className="list-inside list-disc text-xs text-blue-800 space-y-1">
          <li>Your funds will be deposited into the yield strategy</li>
          <li>You can withdraw at any time after the cooldown period</li>
          <li>Yield is not guaranteed and may vary</li>
        </ul>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onSign}
          disabled={isLoading}
          className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {isLoading ? "Signing..." : "Sign & Deposit"}
        </button>
      </div>
    </article>
  );
}

interface YieldOptInSuccessProps {
  amount: string;
  onDone: () => void;
}

function YieldOptInSuccess({ amount, onDone }: YieldOptInSuccessProps) {
  return (
    <article
      className="rounded-2xl border border-border bg-card p-6 text-center"
      aria-labelledby="success-title"
    >
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-8 w-8 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <h2 id="success-title" className="text-xl font-semibold text-foreground">
        Yield Enabled!
      </h2>
      <p className="mt-2 text-sm text-muted">
        You&apos;ve successfully deposited {amount} USDC into yield
      </p>

      <div className="mt-6 rounded-lg border border-border bg-background p-4">
        <p className="text-sm text-muted">What&apos;s next?</p>
        <ul className="mt-2 list-inside list-disc text-sm text-foreground space-y-1">
          <li>Your balance will earn yield automatically</li>
          <li>You can track your earnings in the dashboard</li>
          <li>You can disable yield at any time</li>
        </ul>
      </div>

      <button
        onClick={onDone}
        className="mt-6 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90"
      >
        Done
      </button>
    </article>
  );
}

interface YieldOptInErrorProps {
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}

function YieldOptInError({ message, onRetry, onCancel }: YieldOptInErrorProps) {
  return (
    <article
      className="rounded-2xl border border-border bg-card p-6"
      aria-labelledby="error-title"
    >
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h2 id="error-title" className="text-lg font-semibold text-foreground">
          Transaction Failed
        </h2>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </header>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={onRetry}
          className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90"
        >
          Try Again
        </button>
      </div>
    </article>
  );
}