import { render, screen, within } from "@testing-library/react";
import HarvestHistoryList, { attributeHarvest, type HarvestHistoryEntry } from "./HarvestHistoryList";

const history: HarvestHistoryEntry[] = [
  {
    id: "h1",
    harvested_at: "2026-08-01T00:00:00.000Z",
    delta: "110000000",
    fee: "10000000",
    total_shares: "1000000000",
    user_shares: "250000000",
  },
  {
    id: "h2",
    harvested_at: "2026-08-15T00:00:00.000Z",
    delta: "-40000000",
    fee: "0",
    total_shares: "1000000000",
    user_shares: "500000000",
  },
];

describe("attributeHarvest", () => {
  it("attributes the net harvest by the user's share at the time", () => {
    expect(attributeHarvest(history[0])).toBe(BigInt(25000000));
    expect(attributeHarvest(history[1])).toBe(BigInt(-20000000));
  });

  it("returns zero when there were no shares outstanding", () => {
    expect(attributeHarvest({ ...history[0], total_shares: "0" })).toBe(BigInt(0));
  });
});

describe("HarvestHistoryList", () => {
  it("renders a row per harvest with the user's attributed amount", () => {
    render(<HarvestHistoryList entries={history} />);
    const rows = screen.getAllByTestId("harvest-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByTestId("harvest-amount")).toHaveTextContent("+2.5 USDC");
    expect(within(rows[1]).getByTestId("harvest-amount")).toHaveTextContent("−2 USDC");
  });

  it("visually distinguishes a loss from a gain", () => {
    render(<HarvestHistoryList entries={history} />);
    const [gain, loss] = screen.getAllByTestId("harvest-row");

    expect(gain).toHaveAttribute("data-kind", "gain");
    expect(within(gain).getByText("Gain")).toBeInTheDocument();
    expect(within(gain).getByTestId("harvest-amount")).toHaveClass("text-brand");

    expect(loss).toHaveAttribute("data-kind", "loss");
    expect(within(loss).getByText("Loss")).toBeInTheDocument();
    expect(within(loss).getByTestId("harvest-amount")).toHaveClass("text-red-400");
  });

  it("renders an empty state with no history", () => {
    render(<HarvestHistoryList entries={[]} />);
    expect(screen.getByTestId("harvest-history-empty")).toBeInTheDocument();
  });
});
