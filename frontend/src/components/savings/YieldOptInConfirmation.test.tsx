import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import YieldOptInConfirmation from "./YieldOptInConfirmation";
import { expectNoSeriousViolations } from "@/test/axe";

const mockFeeDisclosure = {
  performanceFeeBps: 2000,
  isLoading: false,
  error: null,
};

describe("YieldOptInConfirmation", () => {
  it("renders title, amount and APR information", () => {
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Enable Yield")).toBeInTheDocument();
    expect(screen.getByText("100 USDC")).toBeInTheDocument();
    expect(screen.getByText("5.5%")).toBeInTheDocument();
  });

  it("displays fee disclosure", () => {
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("20.00%")).toBeInTheDocument();
    expect(
      screen.getByText(/This fee applies only to positive yield/i),
    ).toBeInTheDocument();
  });

  it("displays key points", () => {
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Your principal balance is always protected/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Strategy may change as we add more venues/i),
    ).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const confirmButton = screen.getByRole("button", {
      name: /Confirm yield opt-in/i,
    });
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel when cancel button clicked", () => {
    const onCancel = vi.fn();
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    const cancelButton = screen.getByRole("button", {
      name: /Cancel yield opt-in/i,
    });
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables buttons during loading", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isLoading={true}
      />,
    );
    const confirmButton = screen.getByRole("button", {
      name: /Confirm yield opt-in/i,
    });
    const cancelButton = screen.getByRole("button", {
      name: /Cancel yield opt-in/i,
    });
    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();

    fireEvent.click(confirmButton);
    fireEvent.click(cancelButton);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("shows loading status", () => {
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={true}
      />,
    );
    expect(screen.getByText("Confirming...")).toBeInTheDocument();
    expect(screen.getByText("Processing your request...")).toBeInTheDocument();
  });

  it("displays fee loading state", () => {
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={{
          performanceFeeBps: 2000,
          isLoading: true,
          error: null,
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Loading fee information...")).toBeInTheDocument();
  });

  it("displays fee error state", () => {
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={{
          performanceFeeBps: 0,
          isLoading: false,
          error: "Failed to fetch fee data",
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Failed to fetch fee data")).toBeInTheDocument();
  });
});

describe("YieldOptInConfirmation accessibility", () => {
  it("reports no serious axe violations", async () => {
    const { container } = render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await expectNoSeriousViolations(container);
  });

  it("has h2 heading", () => {
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(1);
  });

  it("has article landmark", () => {
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const articles = screen.getAllByRole("article");
    expect(articles.length).toBeGreaterThanOrEqual(1);
  });

  it("buttons have accessible labels", () => {
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Cancel yield opt-in/i }),
    ).toHaveAccessibleName();
    expect(
      screen.getByRole("button", { name: /Confirm yield opt-in/i }),
    ).toHaveAccessibleName();
  });

  it("loading status is announced to screen readers", () => {
    render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={true}
      />,
    );
    const status = screen.getByText("Processing your request...").closest("p");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("has no serious axe violations in loading state", async () => {
    const { container } = render(
      <YieldOptInConfirmation
        apr={5.5}
        amount="100"
        feeDisclosure={mockFeeDisclosure}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={true}
      />,
    );
    await expectNoSeriousViolations(container);
  });
});
