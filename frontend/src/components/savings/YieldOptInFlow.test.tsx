import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import YieldOptInFlow, { type YieldOptInStep } from "./YieldOptInFlow";
import { expectNoSeriousViolations } from "@/test/axe";

const mockFeeDisclosure = {
  performanceFeeBps: 2000,
  isLoading: false,
  error: null,
};

describe("YieldOptInFlow", () => {
  const defaultProps = {
    apr: 5.5,
    feeDisclosure: mockFeeDisclosure,
    onSignAndSubmit: vi.fn().mockResolvedValue(undefined),
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts at disclosure step by default", () => {
    render(<YieldOptInFlow {...defaultProps} />);
    expect(screen.getByText("Important Risk Disclosure")).toBeInTheDocument();
  });

  it("can start at a different initial step", () => {
    render(<YieldOptInFlow {...defaultProps} initialStep="success" />);
    expect(screen.getByText("Yield Enabled!")).toBeInTheDocument();
  });

  describe("Step 1: Risk Disclosure", () => {
    it("requires checkbox to be checked before proceeding", () => {
      render(<YieldOptInFlow {...defaultProps} />);

      const continueButton = screen.getByRole("button", {
        name: /I Understand, Continue/i,
      });
      expect(continueButton).toBeDisabled();

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      expect(continueButton).toBeEnabled();
    });

    it("proceeds to amount step after acknowledgment", () => {
      render(<YieldOptInFlow {...defaultProps} />);

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      const continueButton = screen.getByRole("button", {
        name: /I Understand, Continue/i,
      });
      fireEvent.click(continueButton);

      expect(screen.getByText("Deposit Amount")).toBeInTheDocument();
    });

    it("calls onCancel when declining", () => {
      render(<YieldOptInFlow {...defaultProps} />);

      const cancelButton = screen.getByRole("button", {
        name: /Decline and go back/i,
      });
      fireEvent.click(cancelButton);

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });
  });

  describe("Step 2: Amount Input", () => {
    const getToAmountStep = () => {
      render(<YieldOptInFlow {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);
      const continueButton = screen.getByRole("button", {
        name: /I Understand, Continue/i,
      });
      fireEvent.click(continueButton);
    };

    it("renders amount input step", () => {
      getToAmountStep();
      expect(screen.getByLabelText("Amount (USDC)")).toBeInTheDocument();
    });

    it("validates amount input", () => {
      getToAmountStep();

      const continueButton = screen.getByRole("button", { name: /Continue/i });
      fireEvent.click(continueButton);

      expect(screen.getByText("Please enter a valid amount")).toBeInTheDocument();
    });

    it("proceeds to confirmation with valid amount", () => {
      getToAmountStep();

      const input = screen.getByLabelText("Amount (USDC)");
      fireEvent.change(input, { target: { value: "100" } });

      const continueButton = screen.getByRole("button", { name: /Continue/i });
      fireEvent.click(continueButton);

      expect(screen.getByText("Enable Yield")).toBeInTheDocument();
    });

    it("goes back to disclosure when cancel is clicked", () => {
      getToAmountStep();

      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(screen.getByText("Important Risk Disclosure")).toBeInTheDocument();
    });
  });

  describe("Step 3: Confirmation", () => {
    const getToConfirmationStep = () => {
      render(<YieldOptInFlow {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);
      const continueButton = screen.getByRole("button", {
        name: /I Understand, Continue/i,
      });
      fireEvent.click(continueButton);
      const input = screen.getByLabelText("Amount (USDC)");
      fireEvent.change(input, { target: { value: "100" } });
      const amountContinueButton = screen.getByRole("button", { name: /Continue/i });
      fireEvent.click(amountContinueButton);
    };

    it("renders confirmation with amount and APR", () => {
      getToConfirmationStep();
      expect(screen.getByText("100 USDC")).toBeInTheDocument();
      expect(screen.getByText("5.5%")).toBeInTheDocument();
    });

    it("proceeds to submit step when confirming", () => {
      getToConfirmationStep();

      const confirmButton = screen.getByRole("button", {
        name: /Confirm yield opt-in/i,
      });
      fireEvent.click(confirmButton);

      expect(screen.getByText("Review & Sign")).toBeInTheDocument();
    });

    it("goes back to amount when cancel is clicked", () => {
      getToConfirmationStep();

      const cancelButton = screen.getByRole("button", {
        name: /Cancel yield opt-in/i,
      });
      fireEvent.click(cancelButton);

      expect(screen.getByLabelText("Amount (USDC)")).toBeInTheDocument();
    });
  });

  describe("Step 4: Submit", () => {
    const getToSubmitStep = () => {
      render(<YieldOptInFlow {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);
      let continueButton = screen.getByRole("button", {
        name: /I Understand, Continue/i,
      });
      fireEvent.click(continueButton);
      const input = screen.getByLabelText("Amount (USDC)");
      fireEvent.change(input, { target: { value: "100" } });
      continueButton = screen.getByRole("button", { name: /Continue/i });
      fireEvent.click(continueButton);
      const confirmButton = screen.getByRole("button", {
        name: /Confirm yield opt-in/i,
      });
      fireEvent.click(confirmButton);
    };

    it("renders submitting step with review details", () => {
      getToSubmitStep();
      expect(screen.getByText("Review & Sign")).toBeInTheDocument();
      expect(screen.getByText("100 USDC")).toBeInTheDocument();
    });

    it("calls onSignAndSubmit when signing", async () => {
      getToSubmitStep();

      const signButton = screen.getByRole("button", {
        name: /Sign & Deposit/i,
      });
      fireEvent.click(signButton);

      await waitFor(() => {
        expect(defaultProps.onSignAndSubmit).toHaveBeenCalledWith("100");
      });
    });

    it("shows success after successful submission", async () => {
      getToSubmitStep();

      const signButton = screen.getByRole("button", {
        name: /Sign & Deposit/i,
      });
      fireEvent.click(signButton);

      await waitFor(() => {
        expect(screen.getByText("Yield Enabled!")).toBeInTheDocument();
      });
    });

    it("shows error after failed submission", async () => {
      const failingProps = {
        ...defaultProps,
        onSignAndSubmit: vi.fn().mockRejectedValue(new Error("Transaction rejected")),
      };
      render(<YieldOptInFlow {...failingProps} />);

      // Go through the flow
      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);
      let continueButton = screen.getByRole("button", {
        name: /I Understand, Continue/i,
      });
      fireEvent.click(continueButton);
      const input = screen.getByLabelText("Amount (USDC)");
      fireEvent.change(input, { target: { value: "100" } });
      continueButton = screen.getByRole("button", { name: /Continue/i });
      fireEvent.click(continueButton);
      const confirmButton = screen.getByRole("button", {
        name: /Confirm yield opt-in/i,
      });
      fireEvent.click(confirmButton);

      const signButton = screen.getByRole("button", {
        name: /Sign & Deposit/i,
      });
      fireEvent.click(signButton);

      await waitFor(() => {
        expect(screen.getByText("Transaction Failed")).toBeInTheDocument();
      });
    });
  });

  describe("Step 5: Success", () => {
    it("renders success state with amount", () => {
      render(<YieldOptInFlow {...defaultProps} initialStep="success" />);
      expect(screen.getByText("Yield Enabled!")).toBeInTheDocument();
      expect(screen.getByText(/successfully deposited/i)).toBeInTheDocument();
    });

    it("calls onDone when done button is clicked", () => {
      render(<YieldOptInFlow {...defaultProps} initialStep="success" />);

      const doneButton = screen.getByRole("button", { name: /Done/i });
      fireEvent.click(doneButton);

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });
  });

  describe("Step 6: Error", () => {
    it("renders error state with message", () => {
      render(<YieldOptInFlow {...defaultProps} initialStep="error" />);
      expect(screen.getByText("Transaction Failed")).toBeInTheDocument();
    });

    it("allows retry", async () => {
      render(<YieldOptInFlow {...defaultProps} initialStep="error" />);

      const retryButton = screen.getByRole("button", { name: /Try Again/i });
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText("Review & Sign")).toBeInTheDocument();
      });
    });

    it("allows cancellation", () => {
      render(<YieldOptInFlow {...defaultProps} initialStep="error" />);

      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });
  });
});

describe("YieldOptInFlow happy path", () => {
  it("completes full flow from disclosure to success", async () => {
    const onSuccess = vi.fn();
    const onSignAndSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <YieldOptInFlow
        apr={5.5}
        feeDisclosure={mockFeeDisclosure}
        onSignAndSubmit={onSignAndSubmit}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />,
    );

    // Step 1: Risk Disclosure
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    let continueButton = screen.getByRole("button", {
      name: /I Understand, Continue/i,
    });
    fireEvent.click(continueButton);

    // Step 2: Amount Input
    const input = screen.getByLabelText("Amount (USDC)");
    fireEvent.change(input, { target: { value: "500" } });
    continueButton = screen.getByRole("button", { name: /Continue/i });
    fireEvent.click(continueButton);

    // Step 3: Confirmation
    const confirmButton = screen.getByRole("button", {
      name: /Confirm yield opt-in/i,
    });
    fireEvent.click(confirmButton);

    // Step 4: Submit
    const signButton = screen.getByRole("button", {
      name: /Sign & Deposit/i,
    });
    fireEvent.click(signButton);

    // Step 5: Success
    await waitFor(() => {
      expect(screen.getByText("Yield Enabled!")).toBeInTheDocument();
    });

    expect(onSignAndSubmit).toHaveBeenCalledWith("500");
    expect(onSuccess).toHaveBeenCalled();
  });
});

describe("YieldOptInFlow accessibility", () => {
  it("reports no serious axe violations at disclosure step", async () => {
    const { container } = render(
      <YieldOptInFlow
        apr={5.5}
        feeDisclosure={mockFeeDisclosure}
        onSignAndSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await expectNoSeriousViolations(container);
  });

  it("reports no serious axe violations at success step", async () => {
    const { container } = render(
      <YieldOptInFlow
        apr={5.5}
        feeDisclosure={mockFeeDisclosure}
        onSignAndSubmit={vi.fn()}
        onCancel={vi.fn()}
        initialStep="success"
      />,
    );
    await expectNoSeriousViolations(container);
  });
});