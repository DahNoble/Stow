import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import YieldRiskDisclosure from "./YieldRiskDisclosure";
import { expectNoSeriousViolations } from "@/test/axe";

describe("YieldRiskDisclosure", () => {
  const defaultProps = {
    onAcknowledge: vi.fn(),
    onDecline: vi.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the risk disclosure modal with title", () => {
    render(<YieldRiskDisclosure {...defaultProps} />);
    expect(screen.getByText("Important Risk Disclosure")).toBeInTheDocument();
  });

  it("displays all three risk sections", () => {
    render(<YieldRiskDisclosure {...defaultProps} />);
    expect(screen.getByText("Non-Custodial Contract Risk")).toBeInTheDocument();
    expect(screen.getByText("Strategy Risk")).toBeInTheDocument();
    expect(screen.getByText("Yield Is Not Guaranteed")).toBeInTheDocument();
  });

  it("has unchecked checkbox initially", () => {
    render(<YieldRiskDisclosure {...defaultProps} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("enables continue button only after checkbox is checked", () => {
    render(<YieldRiskDisclosure {...defaultProps} />);
    const continueButton = screen.getByRole("button", {
      name: /I Understand, Continue/i,
    });
    expect(continueButton).toBeDisabled();

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(continueButton).toBeEnabled();
  });

  it("calls onAcknowledge when continue button is clicked after acknowledgment", () => {
    render(<YieldRiskDisclosure {...defaultProps} />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    const continueButton = screen.getByRole("button", {
      name: /I Understand, Continue/i,
    });
    fireEvent.click(continueButton);

    expect(defaultProps.onAcknowledge).toHaveBeenCalled();
  });

  it("does not call onAcknowledge when continue button is clicked without acknowledgment", () => {
    render(<YieldRiskDisclosure {...defaultProps} />);
    const continueButton = screen.getByRole("button", {
      name: /I Understand, Continue/i,
    });
    fireEvent.click(continueButton);

    expect(defaultProps.onAcknowledge).not.toHaveBeenCalled();
  });

  it("calls onDecline when cancel button is clicked", () => {
    render(<YieldRiskDisclosure {...defaultProps} />);
    const cancelButton = screen.getByRole("button", {
      name: /Decline and go back/i,
    });
    fireEvent.click(cancelButton);

    expect(defaultProps.onDecline).toHaveBeenCalled();
  });

  it("disables both buttons during loading", () => {
    render(<YieldRiskDisclosure {...defaultProps} isLoading={true} />);
    const cancelButton = screen.getByRole("button", {
      name: /Decline and go back/i,
    });
    const continueButton = screen.getByRole("button", {
      name: /I Understand, Continue/i,
    });

    expect(cancelButton).toBeDisabled();
    expect(continueButton).toBeDisabled();
  });

  it("shows processing text when loading", () => {
    render(<YieldRiskDisclosure {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Processing your request...")).toBeInTheDocument();
  });

  it("can uncheck the checkbox", () => {
    render(<YieldRiskDisclosure {...defaultProps} />);
    const checkbox = screen.getByRole("checkbox");

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("can still cancel when checkbox is checked", () => {
    render(<YieldRiskDisclosure {...defaultProps} />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    const cancelButton = screen.getByRole("button", {
      name: /Decline and go back/i,
    });
    fireEvent.click(cancelButton);

    expect(defaultProps.onDecline).toHaveBeenCalled();
  });
});

describe("YieldRiskDisclosure accessibility", () => {
  it("reports no serious axe violations", async () => {
    const { container } = render(
      <YieldRiskDisclosure onAcknowledge={vi.fn()} onDecline={vi.fn()} />,
    );
    await expectNoSeriousViolations(container);
  });

  it("has dialog role", () => {
    render(
      <YieldRiskDisclosure onAcknowledge={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("has aria-modal set to true", () => {
    render(
      <YieldRiskDisclosure onAcknowledge={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("has accessible title", () => {
    render(
      <YieldRiskDisclosure onAcknowledge={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName();
  });

  it("has loading status announced to screen readers", () => {
    render(
      <YieldRiskDisclosure
        onAcknowledge={vi.fn()}
        onDecline={vi.fn()}
        isLoading={true}
      />,
    );
    const status = screen.getByText("Processing your request...").closest("p");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("checkboxes are labelled properly", () => {
    render(
      <YieldRiskDisclosure onAcknowledge={vi.fn()} onDecline={vi.fn()} />,
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveAccessibleName();
  });
});