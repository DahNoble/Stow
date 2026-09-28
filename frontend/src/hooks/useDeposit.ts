import { useCallback, useState } from "react";
import { useAnchorDeposit } from "./useAnchorDeposit";

export type DepositAmountError = "required" | "invalid" | "too-small";

/**
 * Validates a user-entered USDC deposit amount for the flexible-savings
 * deposit modal.
 *
 * Note: this is client-side UX validation only. The underlying SEP-24
 * anchor deposit endpoint (`POST /api/savings/anchor/deposit`, wrapped by
 * `useAnchorDeposit`) doesn't take an amount at all today — the anchor
 * collects it on its own hosted interactive page after redirect. We still
 * validate here so the user gets immediate feedback instead of being sent
 * to the anchor with an amount we already know is bad, and so the modal
 * is ready to pass the amount straight through once/if the anchor
 * integration grows an amount parameter.
 */
export function validateDepositAmount(
  amount: string,
): DepositAmountError | null {
  const trimmed = amount.trim();
  if (!trimmed) return "required";

  const value = Number(trimmed);
  if (!Number.isFinite(value) || Number.isNaN(value)) return "invalid";
  if (value <= 0) return "too-small";

  return null;
}

export type UseDepositStatus =
  | "idle"
  | "submitting"
  | "interactive"
  | "error";

export interface DepositSession {
  deposit_id: string;
  transaction_id: string;
  interactive_url: string;
}

export interface UseDepositReturn {
  status: UseDepositStatus;
  error: Error | null;
  /** Set when `deposit()` was called with an amount that failed validation
   * (see `validateDepositAmount`); cleared on the next successful attempt
   * or on `reset()`. Distinct from `error`, which is a network/API failure. */
  validationError: DepositAmountError | null;
  session: DepositSession | null;
  isLoading: boolean;
  /** Validates `amount` and, if valid, initiates the deposit. Returns the
   * validation error (if any) without starting the request. */
  deposit: (account: string, amount: string) => Promise<DepositAmountError | null>;
  reset: () => void;
}

/**
 * Drives the flexible-savings deposit modal: validates the entered amount,
 * then initiates a SEP-24 deposit for the account via `useAnchorDeposit`.
 * Deliberately thin — all the actual network/session state lives in
 * `useAnchorDeposit`, this hook only adds amount validation on top.
 */
export function useDeposit(): UseDepositReturn {
  const {
    session,
    depositStatus,
    error,
    isLoading,
    initiateDeposit,
    reset: resetAnchorDeposit,
  } = useAnchorDeposit();
  const [validationError, setValidationError] =
    useState<DepositAmountError | null>(null);

  const deposit = useCallback(
    async (
      account: string,
      amount: string,
    ): Promise<DepositAmountError | null> => {
      const validation = validateDepositAmount(amount);
      setValidationError(validation);
      if (validation) return validation;

      await initiateDeposit({ assetCode: "USDC", account });
      return null;
    },
    [initiateDeposit],
  );

  const reset = useCallback(() => {
    setValidationError(null);
    resetAnchorDeposit();
  }, [resetAnchorDeposit]);

  const status: UseDepositStatus =
    depositStatus === "requesting" ? "submitting" : depositStatus;

  return {
    status,
    error,
    validationError,
    session,
    isLoading,
    deposit,
    reset,
  };
}
