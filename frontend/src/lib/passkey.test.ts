import { describe, it, expect, vi, beforeEach } from "vitest";
import { loginWithPasskey, PasskeyLoginError } from "./passkey";
import { api } from "@/lib/api";
import { WebAuthnError, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

vi.mock("@simplewebauthn/browser", async () => {
  const actual = await vi.importActual<typeof import("@simplewebauthn/browser")>(
    "@simplewebauthn/browser",
  );
  return {
    ...actual,
    startAuthentication: vi.fn(),
    browserSupportsWebAuthn: vi.fn(),
  };
});

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

const mockStartAuthentication = startAuthentication as unknown as ReturnType<typeof vi.fn>;
const mockBrowserSupportsWebAuthn = browserSupportsWebAuthn as unknown as ReturnType<typeof vi.fn>;
const mockApiPost = api.post as unknown as ReturnType<typeof vi.fn>;

describe("loginWithPasskey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowserSupportsWebAuthn.mockReturnValue(true);
  });

  it("throws immediately when the browser doesn't support WebAuthn", async () => {
    mockBrowserSupportsWebAuthn.mockReturnValue(false);

    await expect(loginWithPasskey()).rejects.toThrow(PasskeyLoginError);
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("completes the full begin -> assertion -> finish ceremony and returns the session", async () => {
    const options = { challenge: "chal-1" };
    const assertion = { id: "cred-1" };
    const session = {
      access_token: "token-1",
      refresh_token: "refresh-1",
      user: { id: "user-1", stellar_address: "GADDR1" },
    };

    mockApiPost.mockResolvedValueOnce(options).mockResolvedValueOnce(session);
    mockStartAuthentication.mockResolvedValueOnce(assertion);

    const result = await loginWithPasskey();

    expect(mockApiPost).toHaveBeenNthCalledWith(
      1,
      "/api/v1/auth/passkey/authenticate/begin",
      undefined,
      { skipAuth: true },
    );
    expect(mockStartAuthentication).toHaveBeenCalledWith({ optionsJSON: options });
    expect(mockApiPost).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/passkey/authenticate/finish",
      { response: assertion },
      { skipAuth: true },
    );
    expect(result).toEqual(session);
  });

  it("marks a cancelled/dismissed prompt as cancelled", async () => {
    mockApiPost.mockResolvedValueOnce({ challenge: "chal-1" });
    const cause = new DOMException("The user cancelled", "NotAllowedError");
    mockStartAuthentication.mockRejectedValueOnce(
      new WebAuthnError({ message: "cancelled", code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", cause }),
    );

    await expect(loginWithPasskey()).rejects.toMatchObject({
      cancelled: true,
    });
  });

  it("surfaces a non-cancellation assertion failure as a non-cancelled error", async () => {
    mockApiPost.mockResolvedValueOnce({ challenge: "chal-1" });
    const cause = new DOMException("Something else went wrong", "UnknownError");
    mockStartAuthentication.mockRejectedValueOnce(
      new WebAuthnError({ message: "failed", code: "ERROR_AUTHENTICATOR_GENERAL_ERROR", cause }),
    );

    await expect(loginWithPasskey()).rejects.toMatchObject({
      cancelled: false,
    });
  });

  it("wraps a finish-step failure (unrecognized/expired passkey) in PasskeyLoginError", async () => {
    mockApiPost
      .mockResolvedValueOnce({ challenge: "chal-1" })
      .mockRejectedValueOnce(new Error("401"));
    mockStartAuthentication.mockResolvedValueOnce({ id: "cred-1" });

    await expect(loginWithPasskey()).rejects.toThrow(PasskeyLoginError);
  });
});
