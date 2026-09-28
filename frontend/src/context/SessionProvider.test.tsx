import { render, screen, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionProvider, useSession } from "./SessionProvider";
import { apiFetch, getSessionToken } from "@/lib/api";
import { useRouter, usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

function TestComponent() {
  const { user, address, loading, signOut, setSession } = useSession();

  const handleFetch = async () => {
    try {
      await apiFetch("/api/data");
    } catch {
      // handled by apiFetch
    }
  };

  const handleLogin = () => {
    setSession("token-abc", { id: "user-1" }, "GADDRESS123");
  };

  return (
    <div>
      <span data-testid="loading">{loading ? "loading" : "ready"}</span>
      <span data-testid="user">{user ? user.id : "null"}</span>
      <span data-testid="address">{address ?? "null"}</span>
      <button onClick={handleFetch}>Fetch</button>
      <button onClick={handleLogin}>Login</button>
      <button onClick={signOut}>Sign out</button>
    </div>
  );
}

describe("SessionProvider", () => {
  const mockPush = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush });
    (usePathname as unknown as ReturnType<typeof vi.fn>).mockReturnValue("/app/savings");
    global.fetch = vi.fn();
    window.localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("401 handling", () => {
    it("redirects to login with return path on 401", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 401,
        ok: false,
      } as Response);

      render(
        <SessionProvider>
          <TestComponent />
        </SessionProvider>,
      );

      await act(async () => {
        fireEvent.click(screen.getByText("Fetch"));
      });

      expect(mockPush).toHaveBeenCalledWith(
        "/login?session_expired=1&returnTo=%2Fapp%2Fsavings",
      );
    });

    it("clears the user session on 401", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 401,
        ok: false,
      } as Response);

      render(
        <SessionProvider>
          <TestComponent />
        </SessionProvider>,
      );

      await act(async () => {
        fireEvent.click(screen.getByText("Fetch"));
      });

      expect(screen.getByTestId("user")).toHaveTextContent("null");
    });

    it("does not redirect if already on login page", async () => {
      (usePathname as unknown as ReturnType<typeof vi.fn>).mockReturnValue("/login");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 401,
        ok: false,
      } as Response);

      render(
        <SessionProvider>
          <TestComponent />
        </SessionProvider>,
      );

      await act(async () => {
        fireEvent.click(screen.getByText("Fetch"));
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("does not redirect on non-401 responses", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 200,
        ok: true,
      } as Response);

      render(
        <SessionProvider>
          <TestComponent />
        </SessionProvider>,
      );

      await act(async () => {
        fireEvent.click(screen.getByText("Fetch"));
      });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("session and address exposure", () => {
    it("starts with no user/address and loading false once hydration finishes", async () => {
      render(
        <SessionProvider>
          <TestComponent />
        </SessionProvider>,
      );

      expect(await screen.findByTestId("loading")).toHaveTextContent("ready");
      expect(screen.getByTestId("user")).toHaveTextContent("null");
      expect(screen.getByTestId("address")).toHaveTextContent("null");
    });

    it("exposes the session and address after setSession is called", async () => {
      render(
        <SessionProvider>
          <TestComponent />
        </SessionProvider>,
      );
      await screen.findByTestId("loading");

      act(() => {
        fireEvent.click(screen.getByText("Login"));
      });

      expect(screen.getByTestId("user")).toHaveTextContent("user-1");
      expect(screen.getByTestId("address")).toHaveTextContent("GADDRESS123");
      expect(getSessionToken()).toBe("token-abc");
    });

    it("persists the session to storage so a reload can hydrate from it", async () => {
      render(
        <SessionProvider>
          <TestComponent />
        </SessionProvider>,
      );
      await screen.findByTestId("loading");

      act(() => {
        fireEvent.click(screen.getByText("Login"));
      });

      const stored = JSON.parse(window.localStorage.getItem("stow-session")!);
      expect(stored).toEqual({
        accessToken: "token-abc",
        user: { id: "user-1" },
        address: "GADDRESS123",
      });
    });

    it("hydrates user, address, and the api session token from storage on mount", async () => {
      window.localStorage.setItem(
        "stow-session",
        JSON.stringify({
          accessToken: "stored-token",
          user: { id: "user-2" },
          address: "GSTORED456",
        }),
      );

      render(
        <SessionProvider>
          <TestComponent />
        </SessionProvider>,
      );

      expect(await screen.findByTestId("loading")).toHaveTextContent("ready");
      expect(screen.getByTestId("user")).toHaveTextContent("user-2");
      expect(screen.getByTestId("address")).toHaveTextContent("GSTORED456");
      expect(getSessionToken()).toBe("stored-token");
    });

    it("clears the session, storage, and api token on sign-out", async () => {
      render(
        <SessionProvider>
          <TestComponent />
        </SessionProvider>,
      );
      await screen.findByTestId("loading");

      act(() => {
        fireEvent.click(screen.getByText("Login"));
      });
      expect(screen.getByTestId("user")).toHaveTextContent("user-1");

      act(() => {
        fireEvent.click(screen.getByText("Sign out"));
      });

      expect(screen.getByTestId("user")).toHaveTextContent("null");
      expect(screen.getByTestId("address")).toHaveTextContent("null");
      expect(window.localStorage.getItem("stow-session")).toBeNull();
      expect(getSessionToken()).toBeNull();
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});
