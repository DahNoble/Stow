import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionProvider";
import * as api from "@/lib/api";
import DashboardPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/context/SessionProvider", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const mockApiFetch = api.apiFetch as unknown as ReturnType<typeof vi.fn>;
const mockUseSession = useSession as unknown as ReturnType<typeof vi.fn>;

describe("DashboardPage", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
    });
    mockUseSession.mockReturnValue({
      user: { id: "user-1" },
      address: "GADDR",
      loading: false,
    });
  });

  it("renders totals from a mocked summary response", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        address: "GADDR",
        products: [
          { product: "flexible", total: "5000000000" },
          { product: "goals", total: "2500000000" },
        ],
        total: "7500000000",
      }),
    } as Response);

    render(<DashboardPage />);

    expect(screen.getByTestId("summary-cards-loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("summary-cards")).toBeInTheDocument();
    });

    expect(screen.getByTestId("summary-total")).toHaveTextContent("750");
    expect(screen.getByTestId("summary-product-flexible")).toHaveTextContent(
      "500",
    );
    expect(screen.getByTestId("summary-product-goals")).toHaveTextContent(
      "250",
    );
  });

  it("shows an error state with retry when the summary fails to load", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load data/i)).toBeInTheDocument();
    });

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ address: "GADDR", products: [], total: "0" }),
    } as Response);

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByTestId("summary-cards")).toBeInTheDocument();
    });
  });

  it("opens the deposit modal from the quick actions", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ address: "GADDR", products: [], total: "0" }),
    } as Response);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("summary-cards")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^deposit$/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("navigates to the new-goal page from quick actions", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ address: "GADDR", products: [], total: "0" }),
    } as Response);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("summary-cards")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /new goal/i }));

    expect(mockPush).toHaveBeenCalledWith("/savings/goals/new");
  });

  it("navigates to the new-group page from quick actions", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ address: "GADDR", products: [], total: "0" }),
    } as Response);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("summary-cards")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /new group/i }));

    expect(mockPush).toHaveBeenCalledWith("/savings/groups/new");
  });

  it("disables the deposit quick action when there is no address yet", () => {
    mockUseSession.mockReturnValue({
      user: { id: "user-1" },
      address: null,
      loading: false,
    });

    render(<DashboardPage />);

    expect(screen.getByRole("button", { name: /^deposit$/i })).toBeDisabled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
