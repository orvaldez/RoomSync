import { useEffect, useState } from "react";
import { api, isUnauthenticated, type Expense } from "../lib/api";
import { useAuth } from "../auth/useAuth";
import { formatCents } from "../lib/money";

/**
 * The household's expenses, from GET /households/:householdId/expenses.
 *
 * Closes the loop UC-05 opens: before this, an expense could be recorded and
 * then never seen again. Loads on its own like the members panel, so a slow
 * or failed request leaves the rest of the dashboard intact.
 */

type LoadState =
  | { status: "loading" }
  | { status: "ready"; expenses: Expense[] }
  | { status: "error" };

/**
 * A contract `YYYY-MM-DD` as a short readable date.
 *
 * Built from the parts rather than `new Date("2026-09-24")`, which the spec
 * says to read as UTC midnight — west of Greenwich that renders as the day
 * before, so an expense dated the 24th would show as the 23rd.
 */
function formatExpenseDate(calendarDate: string): string {
  const [year, month, day] = calendarDate.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

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
      <h2>Expenses</h2>

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
        <ul className="expense-list">
          {state.expenses.map((expense) => {
            // A member is not always a participant: someone can pay for an
            // expense they take no share of.
            const share = expense.shares.find(
              (candidate) => candidate.userId === user?.id
            );

            return (
              <li key={expense.id}>
                <div className="expense-main">
                  <span>{expense.description}</span>
                  <span className="amount">
                    {formatCents(expense.totalAmountCents)}
                  </span>
                </div>

                <div className="expense-meta muted">
                  <span>
                    {formatExpenseDate(expense.expenseDate)} · paid by{" "}
                    {expense.paidBy.name}
                  </span>
                  <span className="amount">
                    {share
                      ? `your share ${formatCents(share.amountOwedCents)}`
                      : "not your split"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
