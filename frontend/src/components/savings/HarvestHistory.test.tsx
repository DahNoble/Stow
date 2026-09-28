import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HarvestHistory from "./HarvestHistory";
import { expectNoSeriousViolations } from "@/test/axe";

const mockEvents = [
  {
    id: "harvest-1",
    timestamp: Date.parse("2026-01-15"),
    amount: "50000000",
    formattedAmount: "5 XLM",
  },
  {
    id: "harvest-2",
    timestamp: Date.parse("2026-02-15"),
    amount: "75000000",
    formattedAmount: "7.5 XLM",
  },
];

describe("HarvestHistory", () => {
  it("renders table with harvest events", () => {
    render(<HarvestHistory events={mockEvents} />);
    expect(screen.getByText("Harvest History")).toBeInTheDocument();
    expect(screen.getByText("5 XLM")).toBeInTheDocument();
    expect(screen.getByText("7.5 XLM")).toBeInTheDocument();
  });

  it("shows empty state when no events", () => {
    render(<HarvestHistory events={[]} />);
    expect(screen.getByText("No harvest events yet.")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<HarvestHistory events={[]} isLoading={true} />);
    expect(screen.getByText("Loading harvest history...")).toBeInTheDocument();
  });

  it("renders dates in localized format", () => {
    render(<HarvestHistory events={mockEvents} />);
    const dateCells = screen.getAllByText(/Jan|Feb/);
    expect(dateCells.length).toBeGreaterThan(0);
  });
});

describe("HarvestHistory accessibility", () => {
  it("reports no serious axe violations", async () => {
    const { container } = render(<HarvestHistory events={mockEvents} />);
    await expectNoSeriousViolations(container);
  });

  it("has a section landmark", () => {
    render(<HarvestHistory events={mockEvents} />);
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("has a single h2 heading", () => {
    render(<HarvestHistory events={mockEvents} />);
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(1);
  });

  it("has properly scoped table headers", () => {
    render(<HarvestHistory events={mockEvents} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    headers.forEach((header) => {
      expect(header).toHaveAttribute("scope", "col");
    });
  });

  it("loading status is announced to screen readers", () => {
    render(<HarvestHistory events={[]} isLoading={true} />);
    const status = screen.getByText("Loading harvest history...");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("table cells have accessible labels", () => {
    render(<HarvestHistory events={mockEvents} />);
    expect(screen.getByLabelText(/Harvested 5 XLM/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Harvested 7.5 XLM/)).toBeInTheDocument();
  });
});
