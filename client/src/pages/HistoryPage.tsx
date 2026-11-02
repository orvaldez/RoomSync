import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  api,
  isUnauthenticated,
  type Chore,
  type Expense,
  type Household,
  type Settlement,
} from "../lib/api";
import { describeSettlement } from "../lib/balances";
import { formatActivityDate } from "../lib/activity";
import { describeCompletedChore } from "../lib/history";
import { useAuth } from "../auth/useAuth";
import { ExpenseList } from "../components/ExpenseList";

/**
 * UC-11 — everything the household has recorded: what a charge was for,
 * whether a debt was paid, whether a chore was done. Three lists rather than
 * one merged timeline, because each answers a different question and a
 * reader looking for a payment shouldn't scroll past a month of groceries.
 *
 * All three lists come from endpoints that already existed, newest first as
 * the server returns them.
 */

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      household: Household;
      expenses: Expense[];
      settlements: Settlement[];
      chores: Chore[];
    }
  | { status: "no-household" }
  | { status: "error" };

export function HistoryPage() {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<LoadState> {
      const { household } = await api.currentHousehold();
      if (!household) return { status: "no-household" };

      const [{ expenses }, { settlements }, { chores }] = await Promise.all([
        api.expenses(household.id),
        api.settlements(household.id),
        api.chores(household.id, "completed"),
      ]);
      return { status: "ready", household, expenses, settlements, chores };
    }

    load().then(
      (next) => {
        if (!cancelled) setState(next);
      },
      (error) => {
        if (cancelled) return;
        if (isUnauthenticated(error)) {
          void refresh();
          return;
        }
        setState({ status: "error" });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  if (state.status === "loading") {
    return (
      <main className="page" aria-busy="true">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (state.status === "no-household") {
    return <Navigate to="/" replace />;
  }

  if (state.status === "error" || !user) {
    return (
      <main className="page">
        <h1>Something went wrong</h1>
        <p className="muted">We could not load the history.</p>
        <p className="join-actions">
          <Link to="/">Back to the dashboard</Link>
        </p>
      </main>
    );
  }

  const { household, expenses, settlements, chores } = state;

  return (
    <main className="page">
      <h1>History</h1>
      <p className="muted">
        {household.name} · <Link to="/">Back to the dashboard</Link>
      </p>

      {/* With hundreds of expenses, the other two lists are a long scroll
          down; these jump straight to them. */}
      <nav className="history-jump" aria-label="History sections">
        <a href="#history-expenses">Expenses ({expenses.length})</a>
        <a href="#history-payments">Payments ({settlements.length})</a>
        <a href="#history-chores">Completed chores ({chores.length})</a>
      </nav>

      <section className="panel" aria-labelledby="history-expenses">
        <h2 id="history-expenses">Expenses</h2>
        {expenses.length === 0 ? (
          <p className="muted">
            No expenses yet. <Link to="/expenses/new">Add an expense</Link> and it
            will appear here.
          </p>
        ) : (
          <ExpenseList expenses={expenses} currentUserId={user.id} />
        )}
      </section>

      <section className="panel" aria-labelledby="history-payments">
        <h2 id="history-payments">Payments</h2>
        {settlements.length === 0 ? (
          <p className="muted">
            No payments recorded yet. When a roommate pays someone back,{" "}
            <Link to="/balances">record it on Balances</Link>.
          </p>
        ) : (
          // Kept after a balance reaches zero (FR-12): this is the record that
          // a debt was paid, not a list of what is still owed.
          <ul className="settlement-list">
            {settlements.map((settlement) => (
              <li key={settlement.id}>
                <span>{describeSettlement(settlement, user.id)}</span>
                <span className="muted">
                  {formatActivityDate(settlement.settledAt)}
                  {settlement.note && ` · ${settlement.note}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="history-chores">
        <h2 id="history-chores">Completed chores</h2>
        {chores.length === 0 ? (
          <p className="muted">
            No chores completed yet. <Link to="/chores">Open chores</Link> to see
            what is outstanding.
          </p>
        ) : (
          <ul className="settlement-list">
            {chores.map((chore) => (
              <li key={chore.id}>
                <span>{chore.title}</span>
                <span className="muted">{describeCompletedChore(chore, user.id)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
