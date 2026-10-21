import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { ApiError, api, isUnauthenticated, type Expense, type Household } from "../lib/api";
import { formatCents } from "../lib/money";
import {
  canChangeExpense,
  describeDeleted,
  describePayment,
  describeSplit,
  shareRows,
} from "../lib/history";
import { useAuth } from "../auth/useAuth";

/**
 * Wireframe 9 — one expense in full: what it was, who paid, how it was split,
 * and every member's share (UC-11). The payer and the household owner can
 * edit or delete it here (US-12); a deleted expense still opens, saying who
 * deleted it, so a link from the history explains itself.
 */

type LoadState =
  | { status: "loading" }
  | { status: "ready"; household: Household; expense: Expense }
  | { status: "no-household" }
  | { status: "not-found" }
  | { status: "error" };

export function ExpenseDetailPage() {
  const { expenseId = "" } = useParams();
  const location = useLocation();
  const { user, refresh } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null
  );

  const load = useCallback(async (): Promise<LoadState> => {
    const { household } = await api.currentHousehold();
    if (!household) return { status: "no-household" };

    const { expense } = await api.expense(household.id, expenseId);
    return { status: "ready", household, expense };
  }, [expenseId]);

  const handleLoadError = useCallback(
    (error: unknown) => {
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
    },
    [refresh]
  );

  useEffect(() => {
    let cancelled = false;

    load().then(
      (next) => {
        if (!cancelled) setState(next);
      },
      (error) => {
        if (!cancelled) handleLoadError(error);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [load, handleLoadError]);

  /** After a delete: ask the server again, so the page shows what it stored. */
  async function reload(message: string) {
    try {
      setState(await load());
      setNotice(message);
    } catch (error) {
      handleLoadError(error);
    }
  }

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

  const { household, expense } = state;
  const deletedText = describeDeleted(expense, user.id);

  return (
    <main className="page">
      <p>
        <Link to="/history">← History</Link>
      </p>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {deletedText && (
        <p className="expense-deleted-banner" role="status">
          <strong>{deletedText}.</strong> It no longer counts toward anyone's balance.
        </p>
      )}

      <div className="expense-detail-head">
        <h1 className={deletedText ? "expense-deleted" : undefined}>{expense.description}</h1>
        <span className="amount expense-detail-total">
          {formatCents(expense.totalAmountCents)}
        </span>
      </div>
      <p className="muted">{describePayment(expense, user.id)}</p>
      <p className="muted">{describeSplit(expense)}</p>

      {canChangeExpense(expense, user.id, household.role) && (
        <ExpenseActions
          householdId={household.id}
          expense={expense}
          onDeleted={() =>
            reload(`Deleted “${expense.description}”. Balances are updated.`)
          }
        />
      )}

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

/**
 * Edit, and Delete with a confirmation step (US-12). The confirmation is
 * inline rather than a browser dialog, so it reads the same on every phone
 * and says what deleting does before anything changes.
 */
function ExpenseActions({
  householdId,
  expense,
  onDeleted,
}: {
  householdId: string;
  expense: Expense;
  onDeleted: () => void;
}) {
  const { refresh } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteExpense(householdId, expense.id);
      onDeleted();
    } catch (caught) {
      if (isUnauthenticated(caught)) {
        void refresh();
        return;
      }
      setError(
        caught instanceof ApiError ? caught.message : "Something went wrong. Please try again."
      );
      setDeleting(false);
    }
  }

  if (confirming) {
    return (
      <section className="panel expense-delete-confirm" aria-labelledby="delete-heading">
        <h2 id="delete-heading">Delete “{expense.description}”?</h2>
        <p>
          It stops counting toward everyone's balances right away. Payments
          already recorded stay as they are, so a balance someone paid off may
          now run the other way.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete expense"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={deleting}>
            Keep it
          </button>
        </div>
      </section>
    );
  }

  return (
    <p className="page-actions">
      <Link className="button-link" to={`/expenses/${expense.id}/edit`}>
        Edit
      </Link>{" "}
      <button type="button" onClick={() => setConfirming(true)}>
        Delete
      </button>
    </p>
  );
}
