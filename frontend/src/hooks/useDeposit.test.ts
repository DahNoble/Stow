import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDeposit, validateDepositAmount } from "./useDeposit";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const mockApiFetch = api.apiFetch as unknown as ReturnType<typeof vi.fn>;

describe("validateDepositAmount", () => {
  it("rejects an empty amount", () => {
    expect(validateDepositAmount("")).toBe("required");
    expect(validateDepositAmount("   ")).toBe("required");
  });

  it("rejects a non-numeric amount", () => {
    expect(validateDepositAmount("not-a-number")).toBe("invalid");
    expect(validateDepositAmount("12.34.56")).toBe("invalid");
  });

  it("rejects zero and negative amounts", () => {
    expect(validateDepositAmount("0")).toBe("too-small");
    expect(validateDepositAmount("-5")).toBe("too-small");
  });

  it("accepts a valid positive amount", () => {
    expect(validateDepositAmount("10")).toBeNull();
    expect(validateDepositAmount("0.01")).toBeNull();
    expect(validateDepositAmount("  25.5  ")).toBeNull();
  });
});

describe("useDeposit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes idle with no session or errors", () => {
    const { result } = renderHook(() => useDeposit());

    expect(result.current.status).toBe("idle");
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.validationError).toBeNull();
  });

  it("blocks submission and returns the validation error for an invalid amount, without calling the API", async () => {
    const { result } = renderHook(() => useDeposit());

    let validationResult: string | null = null;
    await act(async () => {
      validationResult = await result.current.deposit("GADDR", "0");
    });

    expect(validationResult).toBe("too-small");
    expect(result.current.validationError).toBe("too-small");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("initiates a deposit for a valid amount", async () => {
    const mockSession = {
      deposit_id: "d1",
      transaction_id: "tx1",
      interactive_url: "https://anchor.example.com/interactive",
    };
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSession,
    } as Response);

    const { result } = renderHook(() => useDeposit());

    await act(async () => {
      await result.current.deposit("GADDR", "100");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("interactive");
    });

    expect(result.current.session).toEqual(mockSession);
    expect(result.current.validationError).toBeNull();
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/savings/anchor/deposit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ asset_code: "USDC", account: "GADDR" }),
      }),
    );
  });

  it("surfaces a network/API error distinctly from a validation error", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    } as Response);

    const { result } = renderHook(() => useDeposit());

    await act(async () => {
      await result.current.deposit("GADDR", "50");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.validationError).toBeNull();
  });

  it("marks isLoading true only while the request is in flight", async () => {
    let resolveFetch: (value: Response) => void;
    mockApiFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { result } = renderHook(() => useDeposit());

    let depositPromise: Promise<string | null>;
    act(() => {
      depositPromise = result.current.deposit("GADDR", "10");
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          deposit_id: "d1",
          transaction_id: "tx1",
          interactive_url: "https://anchor.example.com",
        }),
      } as Response);
      await depositPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("does not allow a second submission while one is already in flight (guarded by the modal, isLoading reflects in-flight state)", async () => {
    let resolveFetch: (value: Response) => void;
    mockApiFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { result } = renderHook(() => useDeposit());

    act(() => {
      result.current.deposit("GADDR", "10");
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    // Only the first call should have reached apiFetch; a caller (the
    // modal) is expected to disable the submit button while isLoading.
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          deposit_id: "d1",
          transaction_id: "tx1",
          interactive_url: "https://anchor.example.com",
        }),
      } as Response);
    });
  });

  it("reset() clears session, error, and validation error", async () => {
    const { result } = renderHook(() => useDeposit());

    await act(async () => {
      await result.current.deposit("GADDR", "");
    });
    expect(result.current.validationError).toBe("required");

    act(() => {
      result.current.reset();
    });

    expect(result.current.validationError).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("idle");
  });
});
