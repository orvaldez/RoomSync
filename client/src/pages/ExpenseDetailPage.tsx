import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ApiError, api, isUnauthenticated, type Expense } from "../lib/api";
import { formatCents } from "../lib/money";
import { describePayment, describeSplit, shareRows } from "../lib/history";
import { useAuth } from "../auth/useAuth";

/**
 * Wireframe 9 — one expense in full: what it was, who paid, how it was split,
 * and every member's share (UC-11). Read-only: editing arrives with US-12.
 */

type LoadState =
  | { status: "loading" }
  | { status: "ready"; expense: Expense }
  | { status: "no-household" }
  | { status: "not-found" }
  | { status: "error" };

export function ExpenseDetailPage() {
  const { expenseId = "" } = useParams();
  const { user, refresh } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<LoadState> {
      const { household } = await api.currentHousehold();
      if (!household) return { status: "no-household" };

      const { expense } = await api.expense(household.id, expenseId);
      return { status: "ready", expense };
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
        // The same answer for an id that never existed and one in someone
        // else's household, so the page can't be used to probe for either.
        if (error instanceof ApiError && error.code === "EXPENSE_NOT_FOUND") {
          setState({ status: "not-found" });
          return;
        }
        setState({ status: "error" });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [expenseId, refresh]);

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

  if (state.status === "not-found") {
    return (
      <main className="page">
        <h1>This expense could not be found</h1>
        <p className="muted">It may have been entered in a different household.</p>
        <p className="join-actions">
          <Link to="/history">Back to History</Link>
        </p>
      </main>
    );
  }

  if (state.status === "error" || !user) {
    return (
      <main className="page">
        <h1>Something went wrong</h1>
        <p className="muted">We could not load this expense.</p>
        <p className="join-actions">
          <Link to="/history">Back to History</Link>
        </p>
      </main>
    );
  }

  const { expense } = state;

  return (
    <main className="page">
      <p>
        <Link to="/history">← History</Link>
      </p>

      <div className="expense-detail-head">
        <h1>{expense.description}</h1>
        <span className="amount expense-detail-total">
          {formatCents(expense.totalAmountCents)}
        </span>
      </div>
      <p className="muted">{describePayment(expense, user.id)}</p>
      <p className="muted">{describeSplit(expense)}</p>

      <section className="panel" aria-labelledby="shares-heading">
        <h2 id="shares-heading">Shares</h2>
        <ul className="share-list">
          {shareRows(expense, user.id).map((row) => (
            <li key={row.userId}>
              <span>
                {row.label}
                {row.percent && <span className="muted"> · {row.percent}</span>}
              </span>
              <span className="amount">{formatCents(row.amountCents)}</span>
            </li>
          ))}
          <li className="share-total">
            <span>Total</span>
            <span className="amount">{formatCents(expense.totalAmountCents)}</span>
          </li>
        </ul>
      </section>
    </main>
  );
}
