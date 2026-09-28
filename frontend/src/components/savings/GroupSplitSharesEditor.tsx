"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useGroupSetShares } from "@/hooks/useGroupSetShares";
import type { GroupMember } from "@/hooks/useGroupDetail";
import {
  TOTAL_BPS,
  bpsToPercent,
  equalSharesBps,
  percentToBps,
} from "@/lib/groupShares";

export interface GroupSplitSharesEditorProps {
  groupId: string;
  members: GroupMember[];
  /** Whether the viewer is the group creator (only the creator can set shares). */
  canEdit: boolean;
  /** Shares can only be set once the group is closed. */
  isOpen: boolean;
  /** Called after shares are saved successfully. */
  onSaved?: () => void;
}

function initialPercents(members: GroupMember[]): Record<string, string> {
  const hasShares = members.some((m) => (m.share_bps ?? 0) > 0);
  const bps = hasShares
    ? Object.fromEntries(members.map((m) => [m.address, m.share_bps ?? 0]))
    : equalSharesBps(members.map((m) => m.address));

  return Object.fromEntries(
    Object.entries(bps).map(([address, value]) => [
      address,
      bpsToPercent(value),
    ]),
  );
}

export default function GroupSplitSharesEditor({
  groupId,
  members,
  canEdit,
  isOpen,
  onSaved,
}: GroupSplitSharesEditorProps) {
  const [percents, setPercents] = useState<Record<string, string>>(() =>
    initialPercents(members),
  );
  const { status, error, isLoading, setShares, reset } = useGroupSetShares();

  const parsed = useMemo(() => {
    const bps: Record<string, number> = {};
    const invalid = new Set<string>();
    let total = 0;
    for (const member of members) {
      const value = percentToBps(percents[member.address] ?? "");
      if (value === null) {
        invalid.add(member.address);
      } else {
        bps[member.address] = value;
        total += value;
      }
    }
    return { bps, invalid, total };
  }, [members, percents]);

  const disabled = !canEdit || isOpen || isLoading;
  const totalMatches = parsed.total === TOTAL_BPS;
  const canSave =
    !disabled && members.length > 0 && parsed.invalid.size === 0 && totalMatches;

  const handleChange = (address: string, value: string) => {
    if (status !== "idle") reset();
    setPercents((prev) => ({ ...prev, [address]: value }));
  };

  const handleSplitEvenly = () => {
    if (status !== "idle") reset();
    const bps = equalSharesBps(members.map((m) => m.address));
    setPercents(
      Object.fromEntries(
        Object.entries(bps).map(([address, value]) => [
          address,
          bpsToPercent(value),
        ]),
      ),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    // Omit zero-share members; the contract only needs non-zero entries
    // and rejects any key that isn't a member.
    const sharesBps = Object.fromEntries(
      Object.entries(parsed.bps).filter(([, value]) => value > 0),
    );
    const ok = await setShares(groupId, sharesBps);
    if (ok) onSaved?.();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-card p-6"
      aria-labelledby="split-shares-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2
          id="split-shares-heading"
          className="text-lg font-semibold text-foreground"
        >
          Split shares
        </h2>
        <button
          type="button"
          onClick={handleSplitEvenly}
          disabled={disabled || members.length === 0}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
        >
          Split evenly
        </button>
      </div>

      <p className="text-sm text-muted mb-4">
        {isOpen
          ? "Close the group before setting how the pool is split."
          : !canEdit
            ? "Only the group creator can change the split."
            : "Set each member's percentage of the pool. Shares must total 100%."}
      </p>

      {members.length === 0 ? (
        <p className="text-muted">No members to split between.</p>
      ) : (
        <ul className="space-y-3 mb-4">
          {members.map((member) => {
            const inputId = `share-${member.address}`;
            const isInvalid = parsed.invalid.has(member.address);
            return (
              <li
                key={member.address}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0"
              >
                <label
                  htmlFor={inputId}
                  className="font-mono text-sm text-foreground break-all"
                >
                  {member.address}
                </label>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    id={inputId}
                    type="text"
                    inputMode="decimal"
                    value={percents[member.address] ?? ""}
                    onChange={(e) =>
                      handleChange(member.address, e.target.value)
                    }
                    disabled={disabled}
                    aria-invalid={isInvalid}
                    className={`w-24 rounded-xl border bg-background px-3 py-2 text-right text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-60 ${isInvalid ? "border-red-400" : "border-border"
                      }`}
                  />
                  <span className="text-sm text-muted">%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div
        className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm mb-4 ${totalMatches
          ? "bg-brand/10 text-brand"
          : "bg-red-400/10 text-red-400"
          }`}
        aria-live="polite"
      >
        <span>Total</span>
        <span className="font-medium">{bpsToPercent(parsed.total)}% / 100%</span>
      </div>

      {parsed.invalid.size > 0 && (
        <p className="text-sm text-red-400 mb-4">
          Enter a percentage between 0 and 100 with at most 2 decimals.
        </p>
      )}

      {status === "error" && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400 mb-4"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error?.message ?? "Failed to save shares. Please try again."}
        </div>
      )}

      {status === "success" && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand mb-4"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Shares saved.
        </div>
      )}

      {canEdit && (
        <button
          type="submit"
          disabled={!canSave}
          className="w-full rounded-xl bg-brand/20 hover:bg-brand/30 border border-brand/40 px-6 py-3 text-sm font-medium text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
        >
          {isLoading ? "Saving..." : "Save shares"}
        </button>
      )}
    </form>
  );
}
