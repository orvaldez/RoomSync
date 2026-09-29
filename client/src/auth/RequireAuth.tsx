import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./useAuth";

/**
 * Wraps routes that need a signed-in user.
 *
 * This is convenience, not security. The server rejects every unauthenticated
 * request to an auth-required endpoint with `401 UNAUTHENTICATED`, including
 * direct API calls (FR-03, NFR-07). Anyone can edit the client; what keeps
 * household data private is the check in `requireAuth` on the server.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  // Don't decide anything until /me has answered. Redirecting while the
  // answer is in flight bounces a signed-in user to the login screen on every
  // refresh.
  if (status === "loading") {
    return (
      <main className="centered" aria-busy="true">
        <p>Loading…</p>
      </main>
    );
  }

  if (status === "anonymous") {
    // Remember where they were headed so login can send them back there
    // rather than always to the dashboard.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
