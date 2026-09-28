"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useDeposit, type DepositAmountError } from "@/hooks/useDeposit";

/** Mirrors `(app)/ramps/deposit`'s popup convention for the anchor's
 * hosted interactive page, so a deposit started from either surface opens
 * the same way. */
function openInteractiveWindow(url: string) {
  window.open(url, "sep24_deposit", "width=460,height=720,noopener,noreferrer");
}

export interface DepositModalProps {
  open: boolean;
  onClose: () => void;
  /** Stellar account the deposit will be credited to. */
  account: string;
}

const AMOUNT_ERROR_MESSAGES: Record<DepositAmountError, string> = {
  required: "Enter an amount to deposit.",
  invalid: "Enter a valid number.",
  "too-small": "Amount must be greater than 0.",
};

/**
 * Modal for depositing USDC into flexible savings. Validates the amount,
 * shows submit/pending/success/error states, and disables double-submit.
 *
 * On success, redirects the user to the anchor's hosted interactive page
 * to complete the deposit (see `useDeposit`/`useAnchorDeposit`) rather than
 * closing silently, since the deposit isn't actually credited until that
 * flow finishes.
 */
export default function DepositModal({
  open,
  onClose,
  account,
}: DepositModalProps) {
  const [amount, setAmount] = useState("");
  const { status, error, validationError, session, deposit, reset } =
    useDeposit();
  const dialogRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const isSubmitting = status === "submitting";
  const isSuccess = status === "interactive" && session !== null;

  useEffect(() => {
    if (!open) return;

    setAmount("");
    reset();
    amountInputRef.current?.focus();

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusableElements =
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
      if (!focusableElements || focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleTab);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTab);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // guards against double-submit
    await deposit(account, amount);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-modal-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-2xl border border-border bg-background-elevated p-6 shadow-2xl mx-4"
        role="document"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-1 text-muted hover:bg-card hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50"
        >
          <X className="h-5 w-5" />
        </button>

        <h2
          id="deposit-modal-title"
          className="text-xl font-semibold text-foreground mb-1"
        >
          Deposit to flexible savings
        </h2>

        {isSuccess ? (
          <div className="mt-6 flex flex-col items-center text-center">
            <CheckCircle2
              className="h-12 w-12 text-brand mb-4"
              aria-hidden="true"
            />
            <p className="text-foreground font-medium mb-2">
              Deposit session created
            </p>
            <p className="text-sm text-muted mb-6">
              Continue to complete your deposit with our partner.
            </p>
            <button
              type="button"
              onClick={() => {
                openInteractiveWindow(session.interactive_url);
                onClose();
              }}
              className="w-full rounded-xl bg-brand px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand/90"
            >
              Continue deposit
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <p className="text-sm text-muted">
              Enter the amount of USDC you&apos;d like to deposit.
            </p>

            <div>
              <label
                htmlFor="deposit-amount"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Amount (USDC)
              </label>
              <input
                ref={amountInputRef}
                id="deposit-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-50"
                aria-invalid={validationError !== null}
                aria-describedby={
                  validationError ? "deposit-amount-error" : undefined
                }
              />
              {validationError && (
                <p
                  id="deposit-amount-error"
                  role="alert"
                  className="mt-2 text-sm text-red-400"
                >
                  {AMOUNT_ERROR_MESSAGES[validationError]}
                </p>
              )}
            </div>

            {status === "error" && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error?.message ?? "Failed to start deposit. Please try again."}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-border bg-card hover:bg-card/70 px-4 py-2.5 text-sm font-medium text-foreground transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-xl bg-brand/20 hover:bg-brand/30 border border-brand/40 px-4 py-2.5 text-sm font-medium text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                {isSubmitting ? "Depositing..." : "Deposit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
