import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma";

/**
 * The records balances are derived from: expense shares and settlements.
 *
 * There is deliberately no balance table (NFR-03). Every balance is computed
 * from these rows when it is asked for, so it can never drift from the
 * expenses and payments it describes. This module only reads and writes the
 * rows; the arithmetic is a business rule and lives in `balance.service`.
 */

/** One participant's share of an expense someone else paid: `debtor` owes `creditor`. */
export type Debt = {
  debtorId: string;
  creditorId: string;
  amountCents: number;
};

/** Money that changed hands outside the app: `fromUserId` paid `toUserId`. */
export type Payment = {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
};

export type LedgerEntries = {
  debts: Debt[];
  payments: Payment[];
};

export type SettlementRecord = {
  id: string;
  householdId: string;
  from: { userId: string; name: string };
  to: { userId: string; name: string };
  amountCents: number;
  note: string | null;
  settledAt: Date;
};

export type NewSettlement = {
  householdId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  note: string | null;
};

type Db = Prisma.TransactionClient;

/**
 * Every debt and payment in the household between `userId` and anyone else.
 * Rows not involving `userId` are never loaded, so the cost grows with one
 * member's activity rather than the whole household's (NFR-02).
 *
 * A participant's share of an expense they paid for themselves is not a debt
 * to anyone, so it is left out.
 */
async function findEntries(
  db: Db,
  householdId: string,
  userId: string
): Promise<LedgerEntries> {
  const [shares, settlements] = await Promise.all([
    db.expenseShare.findMany({
      where: {
        expense: { householdId },
        OR: [
          { userId, expense: { paidByUserId: { not: userId } } },
          { userId: { not: userId }, expense: { paidByUserId: userId } },
        ],
      },
      select: {
        userId: true,
        amountOwedCents: true,
        expense: { select: { paidByUserId: true } },
      },
    }),
    db.settlement.findMany({
      where: {
        householdId,
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      select: { fromUserId: true, toUserId: true, amountCents: true },
    }),
  ]);

  return {
    debts: shares.map((share) => ({
      debtorId: share.userId,
      creditorId: share.expense.paidByUserId,
      amountCents: share.amountOwedCents,
    })),
    payments: settlements,
  };
}

/** Everything `userId`'s balances are derived from (UC-07 step 2). */
export async function findEntriesInvolving(
  householdId: string,
  userId: string
): Promise<LedgerEntries> {
  return findEntries(getPrisma(), householdId, userId);
}

/**
 * The first key of every ledger lock, so these locks cannot collide with an
 * advisory lock taken for any other purpose.
 */
const LEDGER_LOCK_NAMESPACE = 41;

/**
 * Take the household's ledger lock for the rest of the transaction `tx`.
 *
 * Every write that can change a balance — a settlement or an expense — takes
 * it first, so those writes in one household happen one at a time, and each
 * one's reads see everything committed before it. Other households are not
 * affected, and reads (viewing balances) never wait for it.
 *
 * A Postgres transaction-scoped advisory lock: released automatically at
 * commit or rollback, so it cannot be left held.
 */
export async function lockLedger(tx: Db, householdId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_NAMESPACE}::int, hashtext(${householdId}))`;
}

/**
 * Record a settlement, but only if `check` accepts the ledger as it stands at
 * the moment of writing (UC-08 4e).
 *
 * `check` receives the payer's debts and payments and throws to refuse. The
 * lock, the read, the check and the insert happen in one transaction, so a
 * settlement or expense recorded concurrently cannot land between the check
 * and the write: it waits for this one, then sees it. Two payments that each
 * fit but together exceed what is owed therefore cannot both succeed — the
 * second is refused with EXCEEDS_BALANCE.
 *
 * Read committed rather than serializable, deliberately: a serializable
 * snapshot is taken before the lock is granted, so it would read the ledger as
 * it was before the transaction it waited for.
 */
export async function createSettlementChecked(
  settlement: NewSettlement,
  check: (entries: LedgerEntries) => void
): Promise<SettlementRecord> {
  return getPrisma().$transaction(async (tx) => {
    await lockLedger(tx, settlement.householdId);

    check(await findEntries(tx, settlement.householdId, settlement.fromUserId));

    const row = await tx.settlement.create({
      data: settlement,
      include: SETTLEMENT_INCLUDE,
    });

    return toSettlementRecord(row);
  });
}

/**
 * Every settlement in the household, newest first. Settlements stay listed
 * after the balance they paid off reaches zero (FR-12, US-08).
 */
export async function listSettlements(householdId: string): Promise<SettlementRecord[]> {
  const rows = await getPrisma().settlement.findMany({
    where: { householdId },
    orderBy: { settledAt: "desc" },
    include: SETTLEMENT_INCLUDE,
  });

  return rows.map(toSettlementRecord);
}

/** Only names — never whole user rows, which carry emails and password hashes. */
const SETTLEMENT_INCLUDE = {
  fromUser: { select: { name: true } },
  toUser: { select: { name: true } },
} satisfies Prisma.SettlementInclude;

type SettlementRow = Prisma.SettlementGetPayload<{ include: typeof SETTLEMENT_INCLUDE }>;

function toSettlementRecord(row: SettlementRow): SettlementRecord {
  return {
    id: row.id,
    householdId: row.householdId,
    from: { userId: row.fromUserId, name: row.fromUser.name },
    to: { userId: row.toUserId, name: row.toUser.name },
    amountCents: row.amountCents,
    note: row.note,
    settledAt: row.settledAt,
  };
}
