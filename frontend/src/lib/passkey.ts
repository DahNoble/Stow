import {
  startAuthentication,
  browserSupportsWebAuthn,
  WebAuthnError,
} from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { api } from "@/lib/api";

export class PasskeyLoginError extends Error {
  /** True when the user dismissed the passkey prompt rather than it failing outright. */
  cancelled: boolean;

  constructor(message: string, cancelled = false) {
    super(message);
    this.name = "PasskeyLoginError";
    this.cancelled = cancelled;
  }
}

export interface PasskeyLoginResult {
  access_token: string;
  refresh_token: string;
  user: { id: string; stellar_address: string; [key: string]: unknown };
}

/**
 * Runs the full passkey login ceremony: fetches WebAuthn assertion options
 * from the backend, prompts the browser's platform authenticator via
 * navigator.credentials.get(), and exchanges the signed assertion for a
 * session. Throws PasskeyLoginError with a user-facing message on any
 * failure, distinguishing a user-cancelled prompt from a real error.
 */
export async function loginWithPasskey(): Promise<PasskeyLoginResult> {
  if (!browserSupportsWebAuthn()) {
    throw new PasskeyLoginError(
      "This browser doesn't support passkeys. Try a recent version of Chrome, Safari, or Edge.",
    );
  }

  const options = await api.post<PublicKeyCredentialRequestOptionsJSON>(
    "/api/v1/auth/passkey/authenticate/begin",
    undefined,
    { skipAuth: true },
  );

  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    if (err instanceof WebAuthnError && err.name === "NotAllowedError") {
      throw new PasskeyLoginError(
        "Passkey login was cancelled or timed out.",
        true,
      );
    }
    throw new PasskeyLoginError(
      "Couldn't complete the passkey prompt. Please try again.",
    );
  }

  try {
    return await api.post<PasskeyLoginResult>(
      "/api/v1/auth/passkey/authenticate/finish",
      { response: assertion },
      { skipAuth: true },
    );
  } catch {
    throw new PasskeyLoginError(
      "That passkey wasn't recognized, or the login attempt expired. Please try again.",
    );
  }
}
