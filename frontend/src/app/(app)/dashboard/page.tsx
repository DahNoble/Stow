"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ArrowDownToLine, Target, Users } from "lucide-react";
import { useSession } from "@/context/SessionProvider";
import { useSavingsSummary } from "@/hooks/useSavingsSummary";
import SummaryCards from "@/components/savings/SummaryCards";
import DepositModal from "@/components/savings/DepositModal";
import ErrorRetry from "@/components/ui/ErrorRetry";

/**
 * Dashboard savings overview: per-product totals from `GET
 * /api/savings/summary`, plus quick actions for the flows a user reaches
 * for most (deposit, start a goal, start a group).
 */
export default function DashboardPage() {
  const { address } = useSession();
  const router = useRouter();
  const { summary, status, error, refetch } = useSavingsSummary(address);
  const [depositOpen, setDepositOpen] = useState(false);

  const isLoading = status === "loading";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <LayoutDashboard className="h-8 w-8 text-brand" />
          <h1 className="text-3xl font-semibold text-foreground">
            Your savings
          </h1>
        </div>

        {status === "error" ? (
          <ErrorRetry error={error} onRetry={refetch} />
        ) : (
          <>
            <SummaryCards summary={summary} isLoading={isLoading} />

            <div className="mt-8">
              <h2 className="mb-3 text-sm font-medium text-muted">
                Quick actions
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setDepositOpen(true)}
                  disabled={!address}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-card/70 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand/50"
                >
                  <ArrowDownToLine
                    className="h-5 w-5 text-brand"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Deposit
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/savings/goals/new")}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-card/70 focus:outline-none focus:ring-2 focus:ring-brand/50"
                >
                  <Target className="h-5 w-5 text-brand" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">
                    New goal
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/savings/groups/new")}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-card/70 focus:outline-none focus:ring-2 focus:ring-brand/50"
                >
                  <Users className="h-5 w-5 text-brand" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">
                    New group
                  </span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {address && (
        <DepositModal
          open={depositOpen}
          onClose={() => setDepositOpen(false)}
          account={address}
        />
      )}
    </div>
  );
}
