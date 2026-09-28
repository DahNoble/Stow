import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import AprDisplaySkeleton from "./AprDisplaySkeleton";

describe("AprDisplaySkeleton", () => {
  it("renders a status element with accessible label", () => {
    render(<AprDisplaySkeleton />);

    expect(
      screen.getByRole("status", { name: /loading apr/i }),
    ).toBeInTheDocument();
  });

  it("applies the animate-pulse class", () => {
    render(<AprDisplaySkeleton />);

    expect(screen.getByRole("status")).toHaveClass("animate-pulse");
  });

  it("merges custom className", () => {
    render(<AprDisplaySkeleton className="text-sm text-muted" />);

    expect(screen.getByRole("status")).toHaveClass("text-sm", "text-muted");
  });
});
