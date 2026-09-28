"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionProvider";

/**
 * Gates every route under (app) on an authenticated session. SessionProvider
 * itself is mounted once in the root layout (shared with (auth)/login, which
 * needs the same session instance to call setSession() after logging in);
 * this layout only reads it to redirect signed-out visitors.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }

  return <>{children}</>;
}
