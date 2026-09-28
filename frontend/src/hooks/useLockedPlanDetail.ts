import { useState, useCallback, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";

export interface LockedPlan {
  on_chain_id: string;
  owner: string;
  /** Locked balance in stroops. */
  balance: string;
  /** ISO-8601 unlock timestamp. */
  unlock_at: string;
}

interface ListLockedResponse {
  address: string;
  plans: LockedPlan[];
  total: number;
  page: number;
  limit: number;
}

export type LockedPlanDetailStatus = "loading" | "ready" | "not-found" | "error";

export interface UseLockedPlanDetailReturn {
  plan: LockedPlan | null;
  status: LockedPlanDetailStatus;
  error: Error | null;
  refetch: () => void;
}

const PAGE_SIZE = 100;

/**
 * Loads a single locked plan by its on-chain id. The backend only exposes
 * the owner-scoped list (`GET /savings/locked?address=`), so this pages
 * through the owner's plans until the requested one is found.
 */
export function useLockedPlanDetail(
  planId: string | null,
  address: string | null,
): UseLockedPlanDetailReturn {
  const [plan, setPlan] = useState<LockedPlan | null>(null);
  const [status, setStatus] = useState<LockedPlanDetailStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);

  const fetchPlan = useCallback(async () => {
    if (planId === null || address === null) return;

    setStatus("loading");
    setError(null);

    try {
      for (let page = 1; ; page++) {
        const query = new URLSearchParams({
          address,
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        const response = await apiFetch(`/api/savings/locked?${query}`);

        if (!response.ok) {
          throw new ApiError(
            `Failed to load locked plan: ${response.statusText}`,
            response.status,
          );
        }

        const data: ListLockedResponse = await response.json();
        const match = data.plans.find((p) => p.on_chain_id === planId);
        if (match) {
          setPlan(match);
          setStatus("ready");
          return;
        }

        if (data.plans.length === 0 || page * data.limit >= data.total) break;
      }

      setPlan(null);
      setStatus("not-found");
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error occurred"));
      setStatus("error");
    }
  }, [planId, address]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan, refetchCount]);

  const refetch = useCallback(() => {
    setRefetchCount((c) => c + 1);
  }, []);

  return { plan, status, error, refetch };
}
