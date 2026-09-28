import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRouter, useSearchParams } from "next/navigation";
import { SessionProvider } from "@/context/SessionProvider";
import { loginWithPasskey, PasskeyLoginError } from "@/lib/passkey";
import LoginPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn().mockReturnValue("/login"),
  useSearchParams: vi.fn(),
}));

vi.mock("@/lib/passkey", async () => {
  const actual = await vi.importActual<typeof import("@/lib/passkey")>("@/lib/passkey");
  return { ...actual, loginWithPasskey: vi.fn() };
});

const mockLoginWithPasskey = loginWithPasskey as unknown as ReturnType<typeof vi.fn>;

function renderLoginPage(params: Record<string, string> = {}) {
  (useSearchParams as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    new URLSearchParams(params),
  );
  return render(
    <SessionProvider>
      <LoginPage />
    </SessionProvider>,
  );
}

describe("LoginPage", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
    });
    window.localStorage.clear();
  });

  it("renders a passkey login prompt", () => {
    renderLoginPage();
    expect(
      screen.getByRole("button", { name: /continue with passkey/i }),
    ).toBeInTheDocument();
  });

  it("shows a session-expired notice when redirected here after a 401", () => {
    renderLoginPage({ session_expired: "1" });
    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
  });

  it("logs in and routes to the dashboard on a successful mocked assertion", async () => {
    mockLoginWithPasskey.mockResolvedValue({
      access_token: "token-1",
      refresh_token: "refresh-1",
      user: { id: "user-1", stellar_address: "GADDR1" },
    });

    renderLoginPage();
    fireEvent.click(screen.getByRole("button", { name: /continue with passkey/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/savings"));
  });

  it("routes to a returnTo path when one was provided", async () => {
    mockLoginWithPasskey.mockResolvedValue({
      access_token: "token-1",
      refresh_token: "refresh-1",
      user: { id: "user-1", stellar_address: "GADDR1" },
    });

    renderLoginPage({ returnTo: "/settings" });
    fireEvent.click(screen.getByRole("button", { name: /continue with passkey/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/settings"));
  });

  it("shows a clear error message when the passkey prompt is cancelled", async () => {
    mockLoginWithPasskey.mockRejectedValue(
      new PasskeyLoginError("Passkey login was cancelled or timed out.", true),
    );

    renderLoginPage();
    fireEvent.click(screen.getByRole("button", { name: /continue with passkey/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cancelled/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows a clear error message when the assertion fails outright", async () => {
    mockLoginWithPasskey.mockRejectedValue(
      new PasskeyLoginError("That passkey wasn't recognized, or the login attempt expired. Please try again."),
    );

    renderLoginPage();
    fireEvent.click(screen.getByRole("button", { name: /continue with passkey/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/wasn't recognized/i);
  });

  it("disables the button while the login attempt is pending", async () => {
    let resolvePromise: (value: unknown) => void = () => {};
    mockLoginWithPasskey.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderLoginPage();
    const button = screen.getByRole("button", { name: /continue with passkey/i });
    fireEvent.click(button);

    expect(await screen.findByRole("button", { name: /waiting for passkey/i })).toBeDisabled();

    await act(async () => {
      resolvePromise({
        access_token: "token-1",
        refresh_token: "refresh-1",
        user: { id: "user-1", stellar_address: "GADDR1" },
      });
    });
  });
});
