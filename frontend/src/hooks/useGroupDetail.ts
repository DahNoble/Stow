import { useState, useCallback, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";

export interface GroupMember {
  address: string;
  contributed: string;
  /** Basis-point split for settlement (0–10000); 0 until shares are set. */
  share_bps?: number;
}

export interface GroupDetail {
  on_chain_id: string;
  name: string;
  /** Stellar address of the creator; receives settlement rounding dust. */
  creator?: string | null;
  balance: string;
  /** Whether the group still accepts members; shares/settle need it closed. */
  open?: boolean;
  settled: boolean;
  members: GroupMember[];
}

export type GroupDetailStatus = "loading" | "ready" | "not-found" | "error";

export interface UseGroupDetailReturn {
  group: GroupDetail | null;
  status: GroupDetailStatus;
  error: Error | null;
  refetch: () => void;
}

export function useGroupDetail(groupId: string | null): UseGroupDetailReturn {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [status, setStatus] = useState<GroupDetailStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);

  const fetchGroup = useCallback(async () => {
    if (groupId === null) return;

    setStatus("loading");
    setError(null);

    try {
      const response = await apiFetch(`/api/savings/groups/${groupId}`);

      if (response.status === 404) {
        setGroup(null);
        setStatus("not-found");
        return;
      }

      if (!response.ok) {
        throw new ApiError(
          `Failed to load group: ${response.statusText}`,
          response.status,
        );
      }

      const data: GroupDetail = await response.json();
      setGroup(data);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error occurred"));
      setStatus("error");
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup, refetchCount]);

  const refetch = useCallback(() => {
    setRefetchCount((c) => c + 1);
  }, []);

  return { group, status, error, refetch };
}
