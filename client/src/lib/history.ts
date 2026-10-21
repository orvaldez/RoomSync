import type { Chore, Expense } from "./api";
import { formatActivityDate } from "./activity";
import { formatBasisPoints } from "./money";

/**
 * Wording for the History screen and the expense detail screen (UC-11),
 * kept out of the components so it can be tested without rendering.
 */

/** "Split equally between 3 people", "Split by amount between 2 people". */
export function describeSplit(expense: Pick<Expense, "splitMethod" | "shares">): string {
  const count = expense.shares.length;

  if (count === 1) {
    return `Charged to ${expense.shares[0].name} alone`;
  }

  const how = {
    EQUAL: "Split equally",
    CUSTOM: "Split by amount",
    PERCENTAGE: "Split by percentage",
  }[expense.splitMethod];

  return `${how} between ${count} people`;
}

/**
 * "2026-09-30" -> "Wednesday, September 30", read as a calendar date with no
 * time zone shift, so an expense dated the 30th never shows as the 29th.
 */
export function formatLongDate(calendarDate: string): string {
  return new Date(`${calendarDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** One row of the shares table on the expense detail screen. */
export type ShareRow = {
  userId: string;
  /** "Agustin (paid)", "You", "You (paid)", "Maya". */
  label: string;
  /** "60%" for a percentage split, otherwise null. */
  percent: string | null;
  amountCents: number;
};

/**
 * The shares in the order the server stored them, which is the order the
 * remainder cents were handed out in, so the rows read the way the split was
 * worked out.
 */
export function shareRows(expense: Expense, currentUserId: string): ShareRow[] {
  return expense.shares.map((share) => {
    const name = share.userId === currentUserId ? "You" : share.name;
    const paid = share.userId === expense.paidBy.userId ? " (paid)" : "";

    return {
      userId: share.userId,
      label: `${name}${paid}`,
      percent:
        expense.splitMethod === "PERCENTAGE" && share.percentBasisPoints !== null
          ? formatBasisPoints(share.percentBasisPoints)
          : null,
      amountCents: share.amountOwedCents,
    };
  });
}

/** "Paid by Agustin on Wednesday, September 30", or "Paid by you on …". */
export function describePayment(expense: Expense, currentUserId: string): string {
  const payer = expense.paidBy.userId === currentUserId ? "you" : expense.paidBy.name;
  return `Paid by ${payer} on ${formatLongDate(expense.expenseDate)}`;
}

/**
 * "Assigned to Sam · completed Oct 9", or "Unassigned · completed Oct 9" for
 * a chore anyone could complete. Who it was assigned to answers "did they do
 * it?" (UC-11): only the assignee can complete an assigned chore.
 */
export function describeCompletedChore(chore: Chore, currentUserId: string): string {
  const who = chore.assignee
    ? `Assigned to ${chore.assignee.userId === currentUserId ? "you" : chore.assignee.name}`
    : "Unassigned";
  const when = chore.completedAt ? ` · completed ${formatActivityDate(chore.completedAt)}` : "";
  return `${who}${when}`;
}

/**
 * Whether the reader may edit or delete `expense` (US-12): the member who paid
 * it, or the household owner. The server decides; this only chooses whether
 * to show the buttons, so nobody is offered an action that would be refused.
 */
export function canChangeExpense(
  expense: Pick<Expense, "paidBy" | "deleted">,
  currentUserId: string,
  role: "OWNER" | "MEMBER"
): boolean {
  if (expense.deleted) return false;
  return role === "OWNER" || expense.paidBy.userId === currentUserId;
}

/** "Deleted by Sam on Oct 21", or "Deleted by you on Oct 21"; null if it wasn't. */
export function describeDeleted(
  expense: Pick<Expense, "deleted">,
  currentUserId: string
): string | null {
  if (!expense.deleted) return null;
  const who = expense.deleted.by.userId === currentUserId ? "you" : expense.deleted.by.name;
  return `Deleted by ${who} on ${formatActivityDate(expense.deleted.at)}`;
}
