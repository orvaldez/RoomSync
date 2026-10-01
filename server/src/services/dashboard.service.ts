import * as balanceService from "./balance.service";
import * as choreService from "./chore.service";
import * as expenseService from "./expense.service";
import * as householdService from "./household.service";
import * as settlementService from "./settlement.service";

/**
 * The household dashboard (UC-10): everything the screen shows, in one
 * response, so the client makes one request rather than five (NFR-02).
 *
 * Composes the services that own each piece instead of querying for them
 * again, so the dashboard cannot disagree with the Balances or Chores screens
 * about what a balance or an upcoming chore is.
 */

/** Contract: "newest first, at most 10". */
export const RECENT_ACTIVITY_LIMIT = 10;

export type ActivityItem =
  | { type: "EXPENSE"; at: Date; expense: expenseService.PublicExpense }
  | { type: "SETTLEMENT"; at: Date; settlement: settlementService.PublicSettlement }
  | { type: "CHORE_COMPLETED"; at: Date; chore: choreService.PublicChore };

/** The contract's dashboard response (Section 4, Dashboard). */
export type Dashboard = {
  household: householdService.PublicHousehold;
  members: householdService.PublicMember[];
  balances: balanceService.BalanceSummary;
  upcomingChores: choreService.PublicChore[];
  recentActivity: ActivityItem[];
};

export async function getDashboard(
  householdId: string,
  userId: string
): Promise<Dashboard> {
  // Each source is capped at the limit before merging: the newest ten across
  // all three can only come from the newest ten of each, so the cost stays
  // flat however much history the household has (NFR-02).
  const [household, members, balances, upcomingChores, expenses, settlements, completed] =
    await Promise.all([
      householdService.getHousehold(userId, householdId),
      householdService.listMembers(householdId),
      balanceService.getBalances(householdId, userId),
      choreService.listUpcomingFor(householdId, userId),
      expenseService.listRecentExpenses(householdId, RECENT_ACTIVITY_LIMIT),
      settlementService.listSettlements(householdId, RECENT_ACTIVITY_LIMIT),
      choreService.listRecentlyCompleted(householdId, RECENT_ACTIVITY_LIMIT),
    ]);

  return {
    household,
    members,
    balances,
    upcomingChores,
    recentActivity: mergeActivity(expenses, settlements, completed),
  };
}

/**
 * One feed of expenses, settlements and completed chores, newest first, at
 * most `limit` (UC-10 step 6).
 *
 * Each item is dated by when it happened in the app: an expense when it was
 * recorded, a settlement when it was recorded, a chore when it was completed.
 * Ties keep the input order (Array.prototype.sort is stable), so the result
 * is deterministic.
 */
export function mergeActivity(
  expenses: expenseService.PublicExpense[],
  settlements: settlementService.PublicSettlement[],
  completedChores: choreService.PublicChore[],
  limit = RECENT_ACTIVITY_LIMIT
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...expenses.map((expense) => ({
      type: "EXPENSE" as const,
      at: expense.createdAt,
      expense,
    })),
    ...settlements.map((settlement) => ({
      type: "SETTLEMENT" as const,
      at: settlement.settledAt,
      settlement,
    })),
    ...completedChores
      .filter((chore) => chore.completedAt !== null)
      .map((chore) => ({
        type: "CHORE_COMPLETED" as const,
        at: chore.completedAt as Date,
        chore,
      })),
  ];

  return items
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}
