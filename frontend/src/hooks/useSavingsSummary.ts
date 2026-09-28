import { useState, useCallback, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";

export interface SavingsProductSummary {
  product: "flexible" | "goals";
  total: string;
}

export interface SavingsSummary {
  address: string;
  products: SavingsProductSummary[];
  total: string;
}

export type SavingsSummaryStatus = "loading" | "ready" | "error";

export interface UseSavingsSummaryReturn {
  summary: SavingsSummary | null;
  status: SavingsSummaryStatus;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetches the address's per-product savings totals (flexible balance +
 * goals saved) plus a grand total, backing the dashboard's savings
 * overview. Mirrors `useGroupDetail`'s fetch-on-mount/refetch shape.
 */
export function useSavingsSummary(
  address: string | null,
): UseSavingsSummaryReturn {
  const [summary, setSummary] = useState<SavingsSummary | null>(null);
  const [status, setStatus] = useState<SavingsSummaryStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);

  const fetchSummary = useCallback(async () => {
    if (!address) return;

    setStatus("loading");
    setError(null);

    try {
      const response = await apiFetch(
        `/api/savings/summary?address=${encodeURIComponent(address)}`,
      );

      if (!response.ok) {
        throw new ApiError(
          `Failed to load savings summary: ${response.statusText}`,
          response.status,
        );
      }

      const data: SavingsSummary = await response.json();
      setSummary(data);
      setStatus("ready");
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Unknown error occurred"),
      );
      setStatus("error");
    }
  }, [address]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refetchCount]);

  const refetch = useCallback(() => {
    setRefetchCount((c) => c + 1);
  }, []);

  return { summary, status, error, refetch };
}
