"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { setSessionExpiredHandler, setSessionToken } from "@/lib/api";

export const SESSION_EXPIRED_PARAM = "session_expired";
const STORAGE_KEY = "stow-session";

interface User {
  id: string;
  email?: string;
}

interface StoredSession {
  accessToken: string;
  user: User;
  address: string;
}

interface SessionContextValue {
  user: User | null;
  address: string | null;
  loading: boolean;
  clearSession: () => void;
  signOut: () => void;
  setSession: (accessToken: string, user: User, address: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken || !parsed?.user || !parsed?.address) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  // Lazy-initialized once on the first render (matching ThemeProvider's
  // readStoredPreference pattern), so the very first render already reflects
  // a stored session instead of flashing signed-out for one render and
  // hydrating in an effect afterwards.
  const [initialSession] = useState(() => {
    const stored = readStoredSession();
    if (stored) setSessionToken(stored.accessToken);
    return stored;
  });
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null);
  const [address, setAddress] = useState<string | null>(initialSession?.address ?? null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const clearSession = useCallback(() => {
    setUser(null);
    setAddress(null);
    setLoading(false);
    setSessionToken(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be unavailable (private browsing, disabled); the
      // in-memory session is already cleared, which is what matters.
    }
  }, []);

  const handleSessionExpired = useCallback(() => {
    clearSession();
    if (!pathname.startsWith("/login")) {
      router.push(
        `/login?${SESSION_EXPIRED_PARAM}=1&returnTo=${encodeURIComponent(pathname || "/")}`,
      );
    }
  }, [clearSession, router, pathname]);

  useEffect(() => {
    setSessionExpiredHandler(handleSessionExpired);
    return () => setSessionExpiredHandler(null);
  }, [handleSessionExpired]);

  const setSession = useCallback(
    (accessToken: string, newUser: User, newAddress: string) => {
      setSessionToken(accessToken);
      setUser(newUser);
      setAddress(newAddress);
      setLoading(false);
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ accessToken, user: newUser, address: newAddress }),
        );
      } catch {
        // Storage may be unavailable; the session still works for this tab.
      }
    },
    [],
  );

  const signOut = useCallback(() => {
    clearSession();
    router.push("/login");
  }, [clearSession, router]);

  return (
    <SessionContext.Provider
      value={{ user, address, loading, clearSession, signOut, setSession }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
