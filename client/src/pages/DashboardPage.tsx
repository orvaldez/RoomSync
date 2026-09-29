import { useCallback, useEffect, useState } from "react";
import { api, type Household } from "../lib/api";
import { useAuth } from "../auth/useAuth";
import { CreateHouseholdPage } from "./CreateHouseholdPage";

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
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const { household } = await api.currentHousehold();
      setState({ status: "ready", household });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { household } = await api.currentHousehold();
        if (cancelled) return;
        setState({ status: "ready", household });
      } catch {
        if (cancelled) return;
        setState({ status: "error" });
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

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
        <button type="button" onClick={() => void load()}>
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

      <div className="panel-grid">
        <section className="panel">
          <h2>Your balance</h2>
          <p className="muted">
            Nothing owed either way yet. Balances appear once expenses are
            recorded.
          </p>
        </section>

        <section className="panel">
          <h2>Your chores</h2>
          <p className="muted">No chores assigned to you.</p>
        </section>

        <section className="panel">
          <h2>Recent activity</h2>
          <p className="muted">
            Expenses, settlements and completed chores will show here.
          </p>
        </section>
      </div>
    </main>
  );
}
