"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useGroupSettle } from "@/hooks/useGroupSettle";
import type { GroupDetail } from "@/hooks/useGroupDetail";
import { formatStroopsAmount } from "@/lib/currency";
import { bpsToPercent, computePayouts } from "@/lib/groupShares";

export interface GroupSettleViewProps {
  group: GroupDetail;
  /** Called after the group settles successfully. */
  onSettled?: () => void;
}

export default function GroupSettleView({
  group,
  onSettled,
}: GroupSettleViewProps) {
  const [confirming, setConfirming] = useState(false);
  const { status, error, isLoading, settleGroup } = useGroupSettle();

  const sharesBps = useMemo(
    () =>
      Object.fromEntries(
        group.members
          .filter((m) => (m.share_bps ?? 0) > 0)
          .map((m) => [m.address, m.share_bps ?? 0]),
      ),
    [group.members],
  );
  const hasShares = Object.keys(sharesBps).length > 0;

  // On-chain, rounding dust goes to the creator (members[0] in the contract).
  const remainderRecipient =
    group.creator ?? group.members[group.members.length - 1]?.address ?? "";

  const payouts = useMemo(
    () =>
      hasShares
        ? computePayouts(group.balance, sharesBps, remainderRecipient)
        : {},
    [group.balance, sharesBps, remainderRecipient, hasShares],
  );

  const isOpen = group.open ?? false;
  const canSettle = !group.settled && !isOpen && hasShares;

  const handleSettle = async () => {
    const result = await settleGroup(group.on_chain_id);
    if (result) {
      setConfirming(false);
      onSettled?.();
    }
  };

  let blockedReason: string | null = null;
  if (group.settled) {
    blockedReason = null;
  } else if (isOpen) {
    blockedReason = "Close the group before settling.";
  } else if (!hasShares) {
    blockedReason = "Set the split shares before settling.";
  }

  return (
    <section
      className="rounded-2xl border border-border bg-card p-6"
      aria-labelledby="settle-heading"
    >
      <h2
        id="settle-heading"
        className="text-lg font-semibold text-foreground mb-2"
      >
        {group.settled ? "Settlement" : "Settle group"}
      </h2>

      {group.settled ? (
        <p className="text-muted">
          This group has been settled and the pool paid out to its members.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted mb-4">
            Settling pays out the pooled{" "}
            <span className="text-foreground font-medium">
              {formatStroopsAmount(group.balance)} XLM
            </span>{" "}
            to each member by their share. This can&apos;t be undone.
          </p>

          {hasShares && (
            <ul className="space-y-3 mb-4">
              {group.members.map((member) => {
                const payout = payouts[member.address] ?? BigInt(0);
                return (
                  <li
                    key={member.address}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0"
                  >
                    <span className="font-mono text-sm text-foreground break-all">
                      {member.address}
                    </span>
                    <span className="text-sm sm:text-right whitespace-nowrap">
                      <span className="text-muted mr-2">
                        {bpsToPercent(member.share_bps ?? 0)}%
                      </span>
                      <span className="text-foreground font-medium">
                        {formatStroopsAmount(payout.toString())} XLM
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {blockedReason && (
            <p className="text-sm text-muted mb-4">{blockedReason}</p>
          )}

          {status === "error" && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400 mb-4"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error?.message ?? "Failed to settle group. Please try again."}
            </div>
          )}

          {confirming ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleSettle}
                disabled={isLoading}
                className="flex-1 rounded-xl bg-brand/20 hover:bg-brand/30 border border-brand/40 px-6 py-3 text-sm font-medium text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                {isLoading ? "Settling..." : "Confirm settle"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isLoading}
                className="flex-1 rounded-xl border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-muted/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canSettle}
              className="w-full rounded-xl bg-brand/20 hover:bg-brand/30 border border-brand/40 px-6 py-3 text-sm font-medium text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              Settle group
            </button>
          )}
        </>
      )}

      {status === "success" && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Group settled.
        </div>
      )}
    </section>
  );
}
