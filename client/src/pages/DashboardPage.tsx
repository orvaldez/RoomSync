import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, isUnauthenticated, type Household } from "../lib/api";
import { useAuth } from "../auth/useAuth";
import { CreateHouseholdPage } from "./CreateHouseholdPage";
import { MembersPanel } from "../components/MembersPanel";
import { ExpensesPanel } from "../components/ExpensesPanel";

/**
 * UC-10, as far as the endpoints allow.
 *
 * Decides between the create-household screen and the dashboard by asking the
 * server which one applies (UC-10 extension 2a). Balances, chores and recent
 * activity appear here as US-05 through US-09 land; each is shown as a
 * labelled empty state rather than hidden, so the screen's shape is visible
 * and the remaining work is legible.
 */

type LoadState =
  | { status: "loading" }
  | { status: "ready"; household: Household | null }
  | { status: "error" };

export function DashboardPage() {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // Set by the add-expense page after a save, so the member sees it landed.
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;

  // Bumped by "Try again" to re-run the effect below, so retrying uses the
  // same loading logic as the first load instead of a second copy of it.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { household } = await api.currentHousehold();
        if (cancelled) return;
        setState({ status: "ready", household });
      } catch (error) {
        if (cancelled) return;
        if (isUnauthenticated(error)) {
          // Retrying cannot fix a missing session. Re-checking it lets
          // RequireAuth send the user to log in; stay on "loading" until then.
          void refresh();
          return;
        }
        setState({ status: "error" });
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [attempt, refresh]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  if (state.status === "loading") {
    return (
      <main className="page" aria-busy="true">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="page">
        <h1>Something went wrong</h1>
        <p className="muted">
          We could not load your household. Check that the server is running.
        </p>
        <button type="button" onClick={retry}>
          Try again
        </button>
      </main>
    );
  }

  if (!state.household) {
    return (
      <CreateHouseholdPage
        onCreated={(household) => setState({ status: "ready", household })}
      />
    );
  }

  const { household } = state;

  return (
    <main className="page">
      <h1>{household.name}</h1>

      <p className="muted">
        Signed in as {user?.name}
        {household.role === "OWNER" && " · You own this household"}
      </p>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <p className="page-actions">
        <Link className="button-link" to="/expenses/new">
          + Add expense
        </Link>
      </p>

      <div className="panel-grid">
        <MembersPanel
          householdId={household.id}
          canInvite={household.role === "OWNER"}
        />
        <ExpensesPanel householdId={household.id} />

        <section className="panel">
          <h2>Your balance</h2>
          <p className="muted">
            Not built yet (US-07). Balances are derived from expense shares and
            settlements when they are read rather than stored as a running
            total, so they appear once that calculation lands.
          </p>
        </section>

        <section className="panel">
          <h2>Your chores</h2>
          <p className="muted">No chores assigned to you.</p>
        </section>

        <section className="panel">
          <h2>Recent activity</h2>
          <p className="muted">
            Settlements and completed chores will show here as US-08 and US-09
            land.
          </p>
        </section>
      </div>
    </main>
  );
}
