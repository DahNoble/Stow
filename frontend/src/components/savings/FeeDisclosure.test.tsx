import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FeeDisclosure from "./FeeDisclosure";
import { expectNoSeriousViolations } from "@/test/axe";

describe("FeeDisclosure", () => {
  it("renders fee percentage from basis points", () => {
    render(<FeeDisclosure performanceFeeBps={2000} />);
    expect(screen.getByText("20.00%")).toBeInTheDocument();
  });

  it("converts basis points correctly", () => {
    render(<FeeDisclosure performanceFeeBps={500} />);
    expect(screen.getByText("5.00%")).toBeInTheDocument();
  });

  it("handles small basis points", () => {
    render(<FeeDisclosure performanceFeeBps={25} />);
    expect(screen.getByText("0.25%")).toBeInTheDocument();
  });

  it("displays fee disclosure copy", () => {
    render(<FeeDisclosure performanceFeeBps={2000} />);
    expect(
      screen.getByText(/This fee applies only to positive yield earned/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You keep 100% of your initial deposit/i)
    ).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(
      <FeeDisclosure performanceFeeBps={2000} isLoading={true} />
    );
    expect(screen.getByText("Loading fee information...")).toBeInTheDocument();
  });

  it("displays error message", () => {
    render(
      <FeeDisclosure
        performanceFeeBps={2000}
        error="Failed to fetch on-chain fee data"
      />
    );
    expect(
      screen.getByText("Failed to fetch on-chain fee data")
    ).toBeInTheDocument();
  });

  it("has accessible label for fee percentage", () => {
    render(<FeeDisclosure performanceFeeBps={2000} />);
    expect(screen.getByLabelText("20% performance fee")).toBeInTheDocument();
  });
});

describe("FeeDisclosure accessibility", () => {
  it("reports no serious axe violations", async () => {
    const { container } = render(
      <FeeDisclosure performanceFeeBps={2000} />
    );
    await expectNoSeriousViolations(container);
  });

  it("has h3 heading", () => {
    render(<FeeDisclosure performanceFeeBps={2000} />);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Performance Fee");
  });

  it("has article landmark", () => {
    render(<FeeDisclosure performanceFeeBps={2000} />);
    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("loading state has proper role and live region", () => {
    render(
      <FeeDisclosure performanceFeeBps={2000} isLoading={true} />
    );
    const status = screen.getByText("Loading fee information...").closest("div");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("error state has alert role", () => {
    render(
      <FeeDisclosure
        performanceFeeBps={2000}
        error="Failed to fetch"
      />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("has no serious axe violations in loading state", async () => {
    const { container } = render(
      <FeeDisclosure performanceFeeBps={2000} isLoading={true} />
    );
    await expectNoSeriousViolations(container);
  });

  it("has no serious axe violations in error state", async () => {
    const { container } = render(
      <FeeDisclosure
        performanceFeeBps={2000}
        error="Failed to fetch"
      />
    );
    await expectNoSeriousViolations(container);
  });
});
