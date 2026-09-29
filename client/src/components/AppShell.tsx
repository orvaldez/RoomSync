import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

/** Header and layout for signed-in pages. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, logOut } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogOut() {
    setLoggingOut(true);
    await logOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell">
      <header className="shell-header">
        <span className="shell-brand">RoomSync</span>

        <div className="shell-user">
          {/* The name is the useful identifier here; showing the email in the
              header exposes it on every screen for no benefit (NFR-06). */}
          <span className="muted">{user?.name}</span>
          <button type="button" onClick={handleLogOut} disabled={loggingOut}>
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </header>

      {children}
    </div>
  );
}
