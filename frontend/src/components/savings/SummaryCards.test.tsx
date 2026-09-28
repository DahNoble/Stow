import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import SummaryCards from "./SummaryCards";
import type { SavingsSummary } from "@/hooks/useSavingsSummary";

const summary: SavingsSummary = {
  address: "GADDR",
  products: [
    { product: "flexible", total: "5000000000" },
    { product: "goals", total: "2500000000" },
  ],
  total: "7500000000",
};

describe("SummaryCards", () => {
  it("renders a skeleton for each expected card while loading", () => {
    render(<SummaryCards summary={null} isLoading={true} />);

    expect(screen.getByTestId("summary-cards-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("summary-cards")).not.toBeInTheDocument();
  });

  it("renders a skeleton when summary is null even if isLoading is false", () => {
    // Defensive: a null summary shouldn't ever render totals, regardless of
    // the loading flag (e.g. a not-yet-started fetch).
    render(<SummaryCards summary={null} isLoading={false} />);

    expect(screen.getByTestId("summary-cards-loading")).toBeInTheDocument();
  });

  it("renders the grand total from a mocked summary response", () => {
    render(<SummaryCards summary={summary} isLoading={false} />);

    expect(screen.getByTestId("summary-cards")).toBeInTheDocument();
    expect(screen.getByTestId("summary-total")).toHaveTextContent("750");
  });

  it("renders a card for each product with its own total", () => {
    render(<SummaryCards summary={summary} isLoading={false} />);

    expect(screen.getByTestId("summary-product-flexible")).toHaveTextContent(
      "500",
    );
    expect(screen.getByTestId("summary-product-goals")).toHaveTextContent(
      "250",
    );
  });

  it("renders a card for every product in the summary, not a hardcoded set", () => {
    const singleProduct: SavingsSummary = {
      address: "GADDR",
      products: [{ product: "flexible", total: "1000" }],
      total: "1000",
    };
    render(<SummaryCards summary={singleProduct} isLoading={false} />);

    // Grand-total card plus exactly one product card, driven entirely by
    // the summary's own `products` array rather than a hardcoded set.
    const cards = screen.getByTestId("summary-cards");
    expect(cards.children).toHaveLength(1 + singleProduct.products.length);
    expect(
      screen.queryByTestId("summary-product-goals"),
    ).not.toBeInTheDocument();
  });

  it("handles a summary with zero totals without crashing", () => {
    const zeroSummary: SavingsSummary = {
      address: "GADDR",
      products: [
        { product: "flexible", total: "0" },
        { product: "goals", total: "0" },
      ],
      total: "0",
    };

    render(<SummaryCards summary={zeroSummary} isLoading={false} />);

    expect(screen.getByTestId("summary-total")).toHaveTextContent("0");
  });
});
