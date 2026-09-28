import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import YieldPositionCardSkeleton from "./YieldPositionCardSkeleton";

describe("YieldPositionCardSkeleton", () => {
  it("renders a status placeholder with accessible label", () => {
    render(<YieldPositionCardSkeleton />);

    expect(
      screen.getByRole("status", { name: /loading yield position/i }),
    ).toBeInTheDocument();
  });

  it("applies the animate-pulse class", () => {
    render(<YieldPositionCardSkeleton />);

    expect(screen.getByRole("status")).toHaveClass("animate-pulse");
  });

  it("merges custom className", () => {
    render(<YieldPositionCardSkeleton className="custom-skeleton-class" />);

    expect(screen.getByRole("status")).toHaveClass("custom-skeleton-class");
  });

  it("renders layout placeholders matching YieldPositionCard dimensions", () => {
    render(<YieldPositionCardSkeleton />);

    const skeleton = screen.getByTestId("yield-position-card-skeleton");
    expect(skeleton).toHaveClass("rounded-2xl", "border", "bg-card", "p-6");
  });
});
