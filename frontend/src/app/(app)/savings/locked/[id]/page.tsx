"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Lock, Unlock } from "lucide-react";
import { useSession } from "@/context/SessionProvider";
import { useLockedPlanDetail } from "@/hooks/useLockedPlanDetail";
import { LockedPlanCountdown } from "@/components/savings/LockedPlanCountdown";
import ErrorRetry from "@/components/ui/ErrorRetry";
import { formatStroopsAmount } from "@/lib/currency";

function formatUnlockDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}

function MessageCard({ title, body }: { title?: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      {title && (
        <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>
      )}
      <p className="text-muted">{body}</p>
    </div>
  );
}

export default function LockedPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string | null>(null);
  const { address, loading: sessionLoading } = useSession();
  const { plan, status, error, refetch } = useLockedPlanDetail(id, address);

  // Tracks unlock reached live on this page, so the UI flips without a refetch.
  const [unlockedLive, setUnlockedLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    params.then(({ id: resolvedId }) => {
      if (!cancelled) setId(resolvedId);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (!sessionLoading && !address) {
    return (
      <PageShell>
        <MessageCard
          title="Sign in required"
          body="Sign in to view your locked savings plans."
        />
      </PageShell>
    );
  }

  if (id === null || sessionLoading || status === "loading") {
    return (
      <PageShell>
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted">
          Loading locked plan...
        </div>
      </PageShell>
    );
  }

  if (status === "not-found") {
    return (
      <PageShell>
        <MessageCard
          title="Locked plan not found"
          body="This plan doesn't exist or doesn't belong to your account."
        />
      </PageShell>
    );
  }

  if (status === "error") {
    return (
      <PageShell>
        <ErrorRetry error={error} onRetry={refetch} />
      </PageShell>
    );
  }

  if (!plan) return null;

  const isUnlocked =
    unlockedLive || new Date(plan.unlock_at).getTime() <= Date.now();
  const StatusIcon = isUnlocked ? Unlock : Lock;

  return (
    <PageShell>
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
          <StatusIcon className="h-7 w-7 sm:h-8 sm:w-8 text-brand shrink-0" />
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">
            Locked plan
          </h1>
        </div>
        <p className="font-mono text-xs text-muted break-all mb-3">
          #{plan.on_chain_id}
        </p>
        <span
          data-testid="locked-plan-status"
          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
            isUnlocked ? "bg-brand/10 text-brand" : "bg-muted/10 text-foreground"
          }`}
        >
          {isUnlocked ? "Unlocked" : "Locked"}
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 mb-6">
        <p className="text-sm text-muted mb-1">Locked balance</p>
        <p className="text-2xl font-semibold text-foreground">
          {formatStroopsAmount(plan.balance)} XLM
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {isUnlocked ? "Lock period complete" : "Time until unlock"}
          </h2>
          <p className="text-sm text-muted">
            {isUnlocked ? "Unlocked" : "Unlocks"}{" "}
            <time dateTime={plan.unlock_at}>
              {formatUnlockDate(plan.unlock_at)}
            </time>
          </p>
        </div>
        <LockedPlanCountdown
          unlockAt={plan.unlock_at}
          onUnlock={() => setUnlockedLive(true)}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Withdraw</h2>
        {isUnlocked ? (
          <p className="text-sm text-muted">
            This plan has unlocked. Its funds can now be withdrawn.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted mb-4">
              Funds are locked on-chain and can&apos;t be withdrawn before the
              unlock date.
            </p>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="w-full cursor-not-allowed rounded-xl bg-muted/20 px-4 py-2 text-sm font-medium text-muted"
            >
              Withdraw (available at unlock)
            </button>
          </>
        )}
      </div>
    </PageShell>
  );
}
