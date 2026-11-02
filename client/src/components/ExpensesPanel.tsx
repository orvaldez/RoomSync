import { useEffect, useState } from "react";
import { api, isUnauthenticated, type Expense } from "../lib/api";
import { useAuth } from "../auth/useAuth";
import { Link } from "react-router-dom";
import { ExpenseList } from "./ExpenseList";

/**
 * The household's expenses, from GET /households/:householdId/expenses.
 *
 * Closes the loop UC-05 opens: before this, an expense could be recorded and
 * then never seen again. Loads on its own like the members panel, so a slow
 * or failed request leaves the rest of the dashboard intact.
 */

/** The newest few; the full list is on the History screen (UC-11). */
const DASHBOARD_LIMIT = 5;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; expenses: Expense[] }
  | { status: "error" };

export function ExpensesPanel({ householdId }: { householdId: string }) {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { expenses } = await api.expenses(householdId);
        if (cancelled) return;
        setState({ status: "ready", expenses });
      } catch (error) {
        if (cancelled) return;
        if (isUnauthenticated(error)) {
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
  }, [householdId, refresh]);

  return (
    <section className="panel" aria-busy={state.status === "loading"}>
      <h2>Recent expenses</h2>

      {state.status === "loading" && <p className="muted">Loading…</p>}

      {state.status === "error" && (
        <p className="muted">Could not load expenses.</p>
      )}

      {state.status === "ready" && state.expenses.length === 0 && (
        <p className="muted">
          No expenses yet. Add one and it will appear here.
        </p>
      )}

      {state.status === "ready" && state.expenses.length > 0 && (
        <>
          <ExpenseList
            expenses={state.expenses.slice(0, DASHBOARD_LIMIT)}
            currentUserId={user?.id}
          />
          <p className="panel-link">
            <Link to="/history">
              {state.expenses.length > DASHBOARD_LIMIT
                ? `See all ${state.expenses.length} in History`
                : "See all history"}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
