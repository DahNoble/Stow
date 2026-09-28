import { Wallet, Target, PiggyBank } from "lucide-react";
import { formatStroops } from "@/lib/currency";
import type { SavingsSummary } from "@/hooks/useSavingsSummary";
import SummaryCardSkeleton from "./SummaryCardSkeleton";

export interface SummaryCardsProps {
  summary: SavingsSummary | null;
  isLoading: boolean;
  className?: string;
}

const PRODUCT_LABELS: Record<string, string> = {
  flexible: "Flexible savings",
  goals: "Savings goals",
};

const PRODUCT_ICONS: Record<string, typeof Wallet> = {
  flexible: Wallet,
  goals: Target,
};

/**
 * Displays the address's per-product savings totals plus a grand total,
 * fed by `GET /api/savings/summary`. Shows a skeleton per card while the
 * summary is loading, so the number of cards doesn't jump once data
 * arrives.
 */
export default function SummaryCards({
  summary,
  isLoading,
  className = "",
}: SummaryCardsProps) {
  if (isLoading || !summary) {
    return (
      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${className}`}
        data-testid="summary-cards-loading"
      >
        <SummaryCardSkeleton />
        <SummaryCardSkeleton />
        <SummaryCardSkeleton />
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${className}`}
      data-testid="summary-cards"
    >
      <div className="rounded-2xl border border-brand/40 bg-brand/10 p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-brand">
          <PiggyBank className="h-4 w-4" aria-hidden="true" />
          Total savings
        </div>
        <p
          data-testid="summary-total"
          className="mt-3 text-2xl font-semibold text-foreground"
        >
          {formatStroops(summary.total)}
        </p>
      </div>

      {summary.products.map((product) => {
        const Icon = PRODUCT_ICONS[product.product] ?? Wallet;
        const label = PRODUCT_LABELS[product.product] ?? product.product;
        return (
          <div
            key={product.product}
            data-testid={`summary-product-${product.product}`}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-muted">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </div>
            <p className="mt-3 text-2xl font-semibold text-foreground">
              {formatStroops(product.total)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
