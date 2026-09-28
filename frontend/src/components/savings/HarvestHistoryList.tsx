import { TrendingDown, TrendingUp } from "lucide-react";
import { formatStroopsAmount } from "@/lib/currency";

/**
 * One adapter-wide harvest, plus the user's share count at that moment.
 * Mirrors the yield-adapter `harvested` event (see
 * `contracts/yield-adapter/README.md`). Amounts and shares are stroop strings.
 */
export interface HarvestHistoryEntry {
  id: string;
  /** ISO timestamp of the harvest. */
  harvested_at: string;
  /** Signed change in strategy balance: positive is yield, negative is loss. */
  delta: string;
  /** Performance fee taken; `0` on a loss. */
  fee: string;
  /** Total shares outstanding at the harvest. */
  total_shares: string;
  /** The user's shares at the harvest. */
  user_shares: string;
}

export interface HarvestHistoryListProps {
  entries: HarvestHistoryEntry[];
  assetCode?: string;
  className?: string;
}

/**
 * The user's portion of a harvest: `(delta - fee) * user_shares / total_shares`.
 * Returns stroops as a bigint (negative for a loss).
 */
export function attributeHarvest(entry: HarvestHistoryEntry): bigint {
  const totalShares = BigInt(entry.total_shares);
  if (totalShares <= BigInt(0)) return BigInt(0);
  const net = BigInt(entry.delta) - BigInt(entry.fee);
  return (net * BigInt(entry.user_shares)) / totalShares;
}

/** Lists the user's history of yield earned or lost, one row per harvest. */
export default function HarvestHistoryList({
  entries,
  assetCode = "USDC",
  className = "",
}: HarvestHistoryListProps) {
  if (entries.length === 0) {
    return (
      <div
        data-testid="harvest-history"
        className={`rounded-2xl border border-border bg-card p-6 ${className}`}
      >
        <h3 className="text-lg font-semibold text-foreground">Yield history</h3>
        <p data-testid="harvest-history-empty" className="mt-1 text-sm text-muted">
          No harvests yet.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="harvest-history"
      className={`rounded-2xl border border-border bg-card p-6 ${className}`}
    >
      <h3 className="text-lg font-semibold text-foreground">Yield history</h3>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="pb-2 font-medium">Date</th>
            <th scope="col" className="pb-2 font-medium">Result</th>
            <th scope="col" className="pb-2 text-right font-medium">Your share</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const amount = attributeHarvest(entry);
            const isLoss = amount < BigInt(0);
            const abs = isLoss ? -amount : amount;
            const Icon = isLoss ? TrendingDown : TrendingUp;

            return (
              <tr
                key={entry.id}
                data-testid="harvest-row"
                data-kind={isLoss ? "loss" : "gain"}
                className="border-t border-border"
              >
                <td className="py-2 text-foreground">
                  {new Date(entry.harvested_at).toLocaleDateString()}
                </td>
                <td className="py-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                      isLoss ? "bg-red-500/10 text-red-400" : "bg-brand/10 text-brand"
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-3 w-3" />
                    {isLoss ? "Loss" : "Gain"}
                  </span>
                </td>
                <td
                  data-testid="harvest-amount"
                  className={`py-2 text-right font-medium ${isLoss ? "text-red-400" : "text-brand"}`}
                >
                  {isLoss ? "−" : "+"}
                  {formatStroopsAmount(abs.toString())} {assetCode}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
