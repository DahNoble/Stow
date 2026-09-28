import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PositionCard from "./PositionCard";
import { expectNoSeriousViolations } from "@/test/axe";

const mockPosition = {
  id: "pos-1",
  amount: "100",
  value: 1000,
  assetCode: "USDC",
};

describe("PositionCard", () => {
  it("renders position value and asset info", () => {
    render(
      <PositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
      />
    );
    expect(screen.getByText("Position Value")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("100 USDC")).toBeInTheDocument();
  });

  it("displays formatted value", () => {
    render(
      <PositionCard
        position={mockPosition}
        formattedValue="1,234.56 USD"
      />
    );
    expect(screen.getByText("1,234.56 USD")).toBeInTheDocument();
  });
});

describe("PositionCard accessibility", () => {
  it("reports no serious axe violations", async () => {
    const { container } = render(
      <PositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
      />
    );
    await expectNoSeriousViolations(container);
  });

  it("has a single h3 heading", () => {
    render(
      <PositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
      />
    );
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(1);
  });

  it("has proper landmark article role", () => {
    render(
      <PositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
      />
    );
    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("value has accessible label", () => {
    render(
      <PositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
      />
    );
    expect(screen.getByLabelText(/Position value/)).toBeInTheDocument();
  });
});
