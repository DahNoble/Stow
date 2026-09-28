import { useState, useCallback } from "react";
import { apiFetch, ApiError } from "@/lib/api";

export type GroupSettleStatus = "idle" | "pending" | "success" | "error";

export interface SettledGroup {
  on_chain_id: string;
  settled: boolean;
}

export interface UseGroupSettleReturn {
  status: GroupSettleStatus;
  error: Error | null;
  isLoading: boolean;
  settleGroup: (groupId: string) => Promise<SettledGroup | null>;
  reset: () => void;
}

export function useGroupSettle(): UseGroupSettleReturn {
  const [status, setStatus] = useState<GroupSettleStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  const settleGroup = useCallback(
    async (groupId: string): Promise<SettledGroup | null> => {
      setStatus("pending");
      setError(null);

      try {
        const response = await apiFetch(
          `/api/savings/groups/${groupId}/settle`,
          { method: "POST" },
        );

        if (!response.ok) {
          let errorMessage = `Failed to settle group: ${response.statusText}`;
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

        const data: SettledGroup = await response.json();
        setStatus("success");
        return data;
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setStatus("error");
        return null;
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
    isLoading: status === "pending",
    settleGroup,
    reset,
  };
}
