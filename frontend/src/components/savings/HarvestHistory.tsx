"use client";

export interface HarvestEvent {
  id: string;
  timestamp: number;
  amount: string;
  formattedAmount: string;
}

export interface HarvestHistoryProps {
  events: HarvestEvent[];
  isLoading?: boolean;
}

export default function HarvestHistory({
  events,
  isLoading = false,
}: HarvestHistoryProps) {
  return (
    <section aria-labelledby="harvest-history-title">
      <header>
        <h2
          id="harvest-history-title"
          className="text-lg font-semibold"
        >
          Harvest History
        </h2>
      </header>

      {isLoading ? (
        <p
          className="mt-4 text-sm text-muted"
          role="status"
          aria-live="polite"
        >
          Loading harvest history...
        </p>
      ) : events.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No harvest events yet.</p>
      ) : (
        <table
          className="mt-4 w-full"
          role="table"
          aria-label="Harvest history events"
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="text-left text-sm font-medium text-muted"
              >
                Date
              </th>
              <th
                scope="col"
                className="text-right text-sm font-medium text-muted"
              >
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-border">
                <td className="py-3 text-sm">
                  {new Date(event.timestamp).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td
                  className="py-3 text-right text-sm font-medium"
                  aria-label={`Harvested ${event.formattedAmount}`}
                >
                  {event.formattedAmount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
