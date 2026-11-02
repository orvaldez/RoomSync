import { Link } from "react-router-dom";
import type { Expense } from "../lib/api";
import { formatCents } from "../lib/money";

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

/**
 * Expense cards (wireframe 8), each opening its detail screen (wireframe 9).
 * Shared by the dashboard panel and the History screen, so an expense reads
 * the same in both.
 */
export function ExpenseList({
  expenses,
  currentUserId,
}: {
  expenses: Expense[];
  currentUserId: string | undefined;
}) {
  return (
    <ul className="expense-list">
      {expenses.map((expense) => {
        // A member is not always a participant: someone can pay for an
        // expense they take no share of.
        const share = expense.shares.find(
          (candidate) => candidate.userId === currentUserId
        );

        return (
          <li key={expense.id}>
            <div className="expense-main">
              <Link to={`/expenses/${expense.id}`}>{expense.description}</Link>
              <span className="amount">{formatCents(expense.totalAmountCents)}</span>
            </div>

            <div className="expense-meta muted">
              <span>
                {formatExpenseDate(expense.expenseDate)} · paid by {expense.paidBy.name}
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
  );
}
