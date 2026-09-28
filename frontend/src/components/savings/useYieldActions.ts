import { useCallback, useState } from 'react';

/**
 * Shared error/retry UX for yield actions (opt-in, request-withdraw, claim).
 *
 * Mirrors the existing "Error/retry UX for failed requests" pattern used
 * elsewhere in the app: a failed action surfaces an actionable error message
 * together with a retry handler instead of failing silently.
 */
export interface YieldActionError {
  message: string;
  retry: () => void;
}

export interface UseYieldActionsResult {
  error: YieldActionError | null;
  clearError: () => void;
  runYieldAction: (action: () => Promise<unknown>) => Promise<void>;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'string' && err) {
    return err;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Wraps a yield action so that any failure produces an actionable error with a
 * retry, rather than a silent failure.
 */
export function useYieldActions(): UseYieldActionsResult {
  const [error, setError] = useState<YieldActionError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const runYieldAction = useCallback(async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError({
        message: toErrorMessage(err),
        retry: () => {
          void runYieldAction(action);
        },
      });
    }
  }, []);

  return { error, clearError, runYieldAction };
}
