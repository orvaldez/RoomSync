import type { ActivityItem, BalanceSummary } from "./api";
import { describeSettlement } from "./balances";
import { formatCents } from "./money";

/**
 * How the dashboard's recent activity and balance summary read on screen.
 * Pure, so who-did-what — the part easiest to get backwards — is tested.
 */

/**
 * One line per activity item, from the reader's side: "You added…",
 * "Maya paid you…", "Sam completed…".
 */
export function describeActivity(item: ActivityItem, currentUserId: string): string {
  switch (item.type) {
    case "EXPENSE": {
      const { expense } = item;
      const who = expense.paidBy.userId === currentUserId ? "You" : expense.paidBy.name;
      return `${who} added "${expense.description}" · ${formatCents(expense.totalAmountCents)}`;
    }

    case "SETTLEMENT":
      return describeSettlement(item.settlement, currentUserId);

    case "CHORE_COMPLETED": {
      // Only the assignee can complete an assigned chore (contract decision
      // 2), so the assignee is who did it. An unassigned chore could have been
      // completed by anyone, and the record does not say who.
      const { chore } = item;
      if (!chore.assignee) return `"${chore.title}" was completed`;
      const who = chore.assignee.userId === currentUserId ? "You" : chore.assignee.name;
      return `${who} completed "${chore.title}"`;
    }
  }
}

/** "Sep 28", in the reader's own time zone: activity times are real instants. */
export function formatActivityDate(at: string): string {
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The one-line answer to "what do I owe?" (UC-10, the Marcus persona).
 * Both directions are named, because owing one roommate and being owed by
 * another do not cancel out — balances are pairwise.
 */
export function summarizeBalances(summary: BalanceSummary): string {
  const { youOweCents, owedToYouCents } = summary.totals;

  if (youOweCents === 0 && owedToYouCents === 0) {
    return "You are all settled up.";
  }

  const parts: string[] = [];
  if (youOweCents > 0) parts.push(`You owe ${formatCents(youOweCents)}`);
  if (owedToYouCents > 0) {
    parts.push(
      youOweCents > 0
        ? `you are owed ${formatCents(owedToYouCents)}`
        : `You are owed ${formatCents(owedToYouCents)}`
    );
  }
  return `${parts.join(" and ")}.`;
}
