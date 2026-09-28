import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StrategyInfo from "./StrategyInfo";
import { expectNoSeriousViolations } from "@/test/axe";

const mockActivatedAt = "2026-01-15T10:30:00Z";

describe("StrategyInfo", () => {
  it("renders strategy name and activation date", () => {
    render(<StrategyInfo strategyName="Aave" activatedAt={mockActivatedAt} />);
    expect(screen.getByText("Aave")).toBeInTheDocument();
    expect(screen.getByText(/Jan 15, 2026/)).toBeInTheDocument();
  });

  it("formats date with locale", () => {
    render(
      <StrategyInfo strategyName="Compound" activatedAt={mockActivatedAt} />,
    );
    const dateElement = screen.getByText(/Jan 15, 2026/);
    expect(dateElement).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(
      <StrategyInfo
        strategyName="Aave"
        activatedAt={mockActivatedAt}
        isLoading={true}
      />,
    );
    expect(
      screen.getByText("Loading strategy information..."),
    ).toBeInTheDocument();
  });

  it("displays error message when provided", () => {
    render(
      <StrategyInfo
        strategyName="Aave"
        activatedAt={mockActivatedAt}
        error="Failed to load strategy information"
      />,
    );
    expect(
      screen.getByText("Failed to load strategy information"),
    ).toBeInTheDocument();
  });

  it("has proper accessible labels for strategy and date", () => {
    render(<StrategyInfo strategyName="Aave" activatedAt={mockActivatedAt} />);
    expect(screen.getByLabelText("Strategy: Aave")).toBeInTheDocument();
    expect(screen.getByLabelText(/Activated at/)).toBeInTheDocument();
  });
});

describe("StrategyInfo accessibility", () => {
  it("reports no serious axe violations", async () => {
    const { container } = render(
      <StrategyInfo strategyName="Aave" activatedAt={mockActivatedAt} />,
    );
    await expectNoSeriousViolations(container);
  });

  it("loading state has proper role and live region", () => {
    render(
      <StrategyInfo
        strategyName="Aave"
        activatedAt={mockActivatedAt}
        isLoading={true}
      />,
    );
    const status = screen
      .getByText("Loading strategy information...")
      .closest("div");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("error state has alert role", () => {
    render(
      <StrategyInfo
        strategyName="Aave"
        activatedAt={mockActivatedAt}
        error="Failed to load"
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("has no serious axe violations in error state", async () => {
    const { container } = render(
      <StrategyInfo
        strategyName="Aave"
        activatedAt={mockActivatedAt}
        error="Failed to load"
      />,
    );
    await expectNoSeriousViolations(container);
  });

  it("has no serious axe violations in loading state", async () => {
    const { container } = render(
      <StrategyInfo
        strategyName="Aave"
        activatedAt={mockActivatedAt}
        isLoading={true}
      />,
    );
    await expectNoSeriousViolations(container);
  });
});
