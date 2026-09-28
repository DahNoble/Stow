import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExpandablePositionCard from "./ExpandablePositionCard";
import { expectNoSeriousViolations } from "@/test/axe";

const mockPosition = {
  id: "pos-1",
  amount: "100",
  value: 1000,
  assetCode: "USDC",
};

const mockStrategy = {
  strategyName: "Aave",
  activatedAt: "2026-01-15T10:30:00Z",
  isLoading: false,
  error: null,
};

describe("ExpandablePositionCard", () => {
  it("renders position card without strategy when strategy not provided", () => {
    render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
      />
    );
    expect(screen.getByText("Position Value")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.queryByText("Aave")).not.toBeInTheDocument();
  });

  it("renders with expand button when strategy provided", () => {
    render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
        strategy={mockStrategy}
      />
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("expands to show strategy info when clicked", () => {
    render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
        strategy={mockStrategy}
      />
    );
    const button = screen.getByRole("button");
    expect(screen.queryByText("Aave")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByText("Aave")).toBeInTheDocument();
  });

  it("collapses strategy info when clicked again", () => {
    render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
        strategy={mockStrategy}
      />
    );
    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(screen.getByText("Aave")).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByText("Aave")).not.toBeInTheDocument();
  });

  it("updates aria-expanded attribute based on expanded state", () => {
    render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
        strategy={mockStrategy}
      />
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("displays loading state in strategy info", () => {
    render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
        strategy={{ ...mockStrategy, isLoading: true }}
      />
    );
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(screen.getByText("Loading strategy information...")).toBeInTheDocument();
  });

  it("displays error state in strategy info", () => {
    render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
        strategy={{
          ...mockStrategy,
          error: "Failed to load strategy",
        }}
      />
    );
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(screen.getByText("Failed to load strategy")).toBeInTheDocument();
  });
});

describe("ExpandablePositionCard accessibility", () => {
  it("reports no serious axe violations without strategy", async () => {
    const { container } = render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
      />
    );
    await expectNoSeriousViolations(container);
  });

  it("reports no serious axe violations with strategy", async () => {
    const { container } = render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
        strategy={mockStrategy}
      />
    );
    await expectNoSeriousViolations(container);
  });

  it("reports no serious axe violations when expanded", async () => {
    const { container } = render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
        strategy={mockStrategy}
      />
    );
    const button = screen.getByRole("button");
    fireEvent.click(button);

    await expectNoSeriousViolations(container);
  });

  it("expand button has accessible label", () => {
    render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
        strategy={mockStrategy}
      />
    );
    expect(screen.getByRole("button")).toHaveAccessibleName();
  });

  it("strategy details region has proper aria attributes when expanded", () => {
    render(
      <ExpandablePositionCard
        position={mockPosition}
        formattedValue="$1,000.00"
        strategy={mockStrategy}
      />
    );
    const button = screen.getByRole("button");
    fireEvent.click(button);

    const region = screen.getByRole("region");
    expect(region).toHaveAttribute("aria-label", "Strategy details");
    expect(region).toHaveAttribute("aria-live", "polite");
  });
});
