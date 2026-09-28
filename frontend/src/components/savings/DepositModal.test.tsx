import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import DepositModal from "./DepositModal";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const mockApiFetch = api.apiFetch as unknown as ReturnType<typeof vi.fn>;

describe("DepositModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    render(<DepositModal open={false} onClose={onClose} account="GADDR" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the form when open, focused on the amount input", () => {
    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/amount \(usdc\)/i)).toHaveFocus();
  });

  it("blocks submission of an empty amount and shows a validation error, without calling the API", async () => {
    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.click(screen.getByRole("button", { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /enter an amount to deposit/i,
      );
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("blocks submission of a zero amount with a specific message", async () => {
    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.change(screen.getByLabelText(/amount \(usdc\)/i), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /must be greater than 0/i,
      );
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("blocks submission of a non-numeric amount", async () => {
    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.change(screen.getByLabelText(/amount \(usdc\)/i), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/valid number/i);
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("submits a valid amount and shows the success state", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        deposit_id: "d1",
        transaction_id: "tx1",
        interactive_url: "https://anchor.example.com/interactive",
      }),
    } as Response);

    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.change(screen.getByLabelText(/amount \(usdc\)/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^deposit$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continue deposit/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows an error state on API failure and does not close the modal", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    } as Response);

    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.change(screen.getByLabelText(/amount \(usdc\)/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /failed to start deposit|internal server error/i,
      );
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables the deposit button while submitting to prevent double-submit", async () => {
    let resolveFetch: (value: Response) => void;
    mockApiFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.change(screen.getByLabelText(/amount \(usdc\)/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^deposit$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /depositing/i })).toBeDisabled();
    });

    await act(async () => {
      resolveFetch!({
        ok: true,
        json: async () => ({
          deposit_id: "d1",
          transaction_id: "tx1",
          interactive_url: "https://anchor.example.com",
        }),
      } as Response);
    });
  });

  it("calls onClose when the cancel button is clicked", () => {
    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close (X) button is clicked", () => {
    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.click(screen.getByRole("button", { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape key", () => {
    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the backdrop", () => {
    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the dialog content", () => {
    render(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    fireEvent.click(screen.getByRole("document"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("resets the amount field each time the modal reopens", () => {
    const { rerender } = render(
      <DepositModal open={true} onClose={onClose} account="GADDR" />,
    );

    fireEvent.change(screen.getByLabelText(/amount \(usdc\)/i), {
      target: { value: "42" },
    });
    expect(screen.getByLabelText(/amount \(usdc\)/i)).toHaveValue("42");

    rerender(<DepositModal open={false} onClose={onClose} account="GADDR" />);
    rerender(<DepositModal open={true} onClose={onClose} account="GADDR" />);

    expect(screen.getByLabelText(/amount \(usdc\)/i)).toHaveValue("");
  });
});
