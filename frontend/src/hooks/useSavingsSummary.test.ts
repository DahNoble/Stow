import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSavingsSummary } from "./useSavingsSummary";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const mockApiFetch = api.apiFetch as unknown as ReturnType<typeof vi.fn>;

describe("useSavingsSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when address is null", () => {
    renderHook(() => useSavingsSummary(null));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("fetches the summary for the given address and reports ready", async () => {
    const mockSummary = {
      address: "GADDR",
      products: [
        { product: "flexible", total: "500000" },
        { product: "goals", total: "250000" },
      ],
      total: "750000",
    };

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSummary,
    } as Response);

    const { result } = renderHook(() => useSavingsSummary("GADDR"));

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.summary).toEqual(mockSummary);
    expect(result.current.error).toBeNull();
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/savings/summary?address=GADDR",
    );
  });

  it("URL-encodes the address in the query string", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ address: "G A", products: [], total: "0" }),
    } as Response);

    renderHook(() => useSavingsSummary("G A"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/savings/summary?address=G%20A",
      );
    });
  });

  it("reports error status on a non-ok response", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    } as Response);

    const { result } = renderHook(() => useSavingsSummary("GADDR"));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("reports error status when the fetch itself throws", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useSavingsSummary("GADDR"));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error?.message).toBe("network down");
  });

  it("refetch() triggers a new request", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ address: "GADDR", products: [], total: "0" }),
    } as Response);

    const { result } = renderHook(() => useSavingsSummary("GADDR"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });
  });
});
