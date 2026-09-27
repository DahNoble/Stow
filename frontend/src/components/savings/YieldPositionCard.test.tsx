import { render, screen } from "@testing-library/react";
import YieldPositionCard, { type YieldPosition } from "./YieldPositionCard";

const position: YieldPosition = {
  address: "GABC",
  shares: "50000000",
  estimated_asset_value: "55000000",
  exchange_rate_snapshot: "1.1",
  pending_withdrawal_claimable_at: null,
  updated_at: "2026-09-01T00:00:00.000Z",
  lifetime_yield_earned: "5000000",
};

describe("YieldPositionCard", () => {
  it("renders shares, estimated value, and lifetime yield for a position", () => {
    render(<YieldPositionCard position={position} />);
    expect(screen.getByTestId("yield-position-shares")).toHaveTextContent("5");
    expect(screen.getByTestId("yield-position-value")).toHaveTextContent("5.5 USDC");
    const lifetime = screen.getByTestId("yield-position-lifetime");
    expect(lifetime).toHaveTextContent("+0.5 USDC");
    expect(lifetime).toHaveClass("text-brand");
    expect(screen.queryByTestId("yield-position-empty")).not.toBeInTheDocument();
  });

  it("shows a lifetime loss as negative, in red", () => {
    render(<YieldPositionCard position={{ ...position, lifetime_yield_earned: "-2000000" }} />);
    const lifetime = screen.getByTestId("yield-position-lifetime");
    expect(lifetime).toHaveTextContent("−0.2 USDC");
    expect(lifetime).toHaveClass("text-red-400");
  });

  it("shows a placeholder when value or lifetime yield is unknown", () => {
    render(
      <YieldPositionCard
        position={{ ...position, estimated_asset_value: null, lifetime_yield_earned: null }}
      />,
    );
    expect(screen.getByTestId("yield-position-value")).toHaveTextContent("—");
    expect(screen.getByTestId("yield-position-lifetime")).toHaveTextContent("—");
  });

  it("renders the empty state when there is no position", () => {
    render(<YieldPositionCard position={null} />);
    expect(screen.getByTestId("yield-position-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("yield-position-shares")).not.toBeInTheDocument();
  });

  it("renders the empty state for the backend's zero-share response", () => {
    render(
      <YieldPositionCard
        position={{ ...position, shares: "0", estimated_asset_value: null, lifetime_yield_earned: null }}
      />,
    );
    expect(screen.getByTestId("yield-position-empty")).toBeInTheDocument();
  });
});
