import * as householdRepository from "../repositories/household.repository";
import * as ledgerRepository from "../repositories/ledger.repository";

/**
 * Balances between members (UC-07), derived on every request from expense
 * shares and settlements and never stored (NFR-03).
 */

/** The contract's `BalancePublic`: positive means that member owes the requester. */
export type PublicBalance = {
  userId: string;
  name: string;
  netCents: number;
};

export type BalanceSummary = {
  balances: PublicBalance[];
  totals: { youOweCents: number; owedToYouCents: number };
};

/**
 * How much `debtorId` currently owes `creditorId`, in cents. Negative when
 * the debt runs the other way.
 *
 *     their shares of expenses the creditor paid
 *   − the creditor's shares of expenses the debtor paid
 *   − what the debtor has paid the creditor
 *   + what the creditor has paid the debtor
 *
 * Pure and integer-only, so it is exact to the cent (FR-18) and testable
 * without a database.
 */
export function netOwed(
  creditorId: string,
  debtorId: string,
  entries: ledgerRepository.LedgerEntries
): number {
  let net = 0;

  for (const debt of entries.debts) {
    if (debt.debtorId === debtorId && debt.creditorId === creditorId) net += debt.amountCents;
    if (debt.debtorId === creditorId && debt.creditorId === debtorId) net -= debt.amountCents;
  }

  for (const payment of entries.payments) {
    if (payment.fromUserId === debtorId && payment.toUserId === creditorId) net -= payment.amountCents;
    if (payment.fromUserId === creditorId && payment.toUserId === debtorId) net += payment.amountCents;
  }

  return net;
}

/**
 * The requester's balance with every other member, including zeros (UC-07
 * 2a), in household join order, plus totals in each direction.
 *
 * Balances are pairwise, not netted across the household: if Maya owes you
 * $20 and you owe Sam $15, that is two balances, not one of $5 — roommates
 * settle with each other, so the pairs are what they act on.
 */
export async function getBalances(
  householdId: string,
  userId: string
): Promise<BalanceSummary> {
  const [members, entries] = await Promise.all([
    householdRepository.listMembers(householdId),
    ledgerRepository.findEntriesInvolving(householdId, userId),
  ]);

  const balances = members
    .filter((member) => member.userId !== userId)
    .map((member) => ({
      userId: member.userId,
      name: member.name,
      netCents: netOwed(userId, member.userId, entries),
    }));

  return {
    balances,
    totals: {
      youOweCents: balances.reduce((sum, b) => sum + Math.max(0, -b.netCents), 0),
      owedToYouCents: balances.reduce((sum, b) => sum + Math.max(0, b.netCents), 0),
    },
  };
}
