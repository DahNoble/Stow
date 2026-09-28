import { useState, useCallback } from "react";
import { apiFetch, ApiError } from "@/lib/api";

export type GroupSetSharesStatus = "idle" | "saving" | "success" | "error";

/** Member address -> basis points (must sum to 10_000). */
export type SharesBps = Record<string, number>;

export interface UseGroupSetSharesReturn {
  status: GroupSetSharesStatus;
  error: Error | null;
  isLoading: boolean;
  setShares: (groupId: string, sharesBps: SharesBps) => Promise<boolean>;
  reset: () => void;
}

export function useGroupSetShares(): UseGroupSetSharesReturn {
  const [status, setStatus] = useState<GroupSetSharesStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  const setShares = useCallback(
    async (groupId: string, sharesBps: SharesBps): Promise<boolean> => {
      setStatus("saving");
      setError(null);

      try {
        const response = await apiFetch(
          `/api/savings/groups/${groupId}/shares`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shares_bps: sharesBps }),
          },
        );

        if (!response.ok) {
          let errorMessage = `Failed to save shares: ${response.statusText}`;
          try {
            const errorData = await response.json();
            if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            // Response body is not JSON, use default message
          }
          throw new ApiError(errorMessage, response.status);
        }

        setStatus("success");
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setStatus("error");
        return false;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return {
    status,
    error,
    isLoading: status === "saving",
    setShares,
    reset,
  };
}
