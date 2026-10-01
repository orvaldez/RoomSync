import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma";
import { lockLedger } from "./ledger.repository";

/**
 * Declared here rather than imported from the generated Prisma client, for the
 * same reason as `MembershipRole`: services depend on the repository's
 * contract, not on Prisma's types. The strings match the schema's enum.
 */
export type SplitMethod = "EQUAL" | "CUSTOM" | "PERCENTAGE";

/** One participant's share, with the name the contract's `SharePublic` needs. */
export type ShareRecord = {
  userId: string;
  name: string;
  amountOwedCents: number;
  percentBasisPoints: number | null;
};

export type ExpenseRecord = {
  id: string;
  householdId: string;
  description: string;
  totalAmountCents: number;
  expenseDate: Date;
  paidBy: { userId: string; name: string };
  splitMethod: SplitMethod;
  shares: ShareRecord[];
  createdAt: Date;
};

export type NewExpense = {
  householdId: string;
  description: string;
  totalAmountCents: number;
  expenseDate: Date;
  paidByUserId: string;
  splitMethod: SplitMethod;
  shares: {
    userId: string;
    amountOwedCents: number;
    percentBasisPoints: number | null;
  }[];
};

/**
 * What every expense query loads alongside the expense. Only users' names are
 * selected, never the whole user row, which carries the email and password
 * hash (NFR-06).
 *
 * Shares come back in insertion order, which is the order the split assigned
 * them in: ids are cuids, which sort by creation time.
 */
const EXPENSE_INCLUDE = {
  paidBy: { select: { name: true } },
  shares: {
    orderBy: { id: "asc" },
    select: {
      userId: true,
      amountOwedCents: true,
      percentBasisPoints: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof EXPENSE_INCLUDE }>;

function toExpenseRecord(row: ExpenseRow): ExpenseRecord {
  return {
    id: row.id,
    householdId: row.householdId,
    description: row.description,
    totalAmountCents: row.totalAmountCents,
    expenseDate: row.expenseDate,
    paidBy: { userId: row.paidByUserId, name: row.paidBy.name },
    splitMethod: row.splitMethod as SplitMethod,
    shares: row.shares.map((share) => ({
      userId: share.userId,
      name: share.user.name,
      amountOwedCents: share.amountOwedCents,
      percentBasisPoints: share.percentBasisPoints,
    })),
    createdAt: row.createdAt,
  };
}

/**
 * Create an expense and all of its shares atomically (UC-05 10a).
 *
 * One transaction: if any share fails to insert, the expense is rolled back
 * with it. An expense with only some of its shares would silently corrupt
 * every balance derived from it.
 *
 * It takes the household's ledger lock first, because a new expense changes
 * balances: a settlement being checked at the same moment must either see this
 * expense or finish before it (UC-08 4e). See `lockLedger`.
 */
export async function createWithShares(
  expense: NewExpense
): Promise<ExpenseRecord> {
  return getPrisma().$transaction(async (tx) => {
    await lockLedger(tx, expense.householdId);

    const row = await tx.expense.create({
      data: {
        householdId: expense.householdId,
        description: expense.description,
        totalAmountCents: expense.totalAmountCents,
        expenseDate: expense.expenseDate,
        paidByUserId: expense.paidByUserId,
        splitMethod: expense.splitMethod,
        shares: { create: expense.shares },
      },
      include: EXPENSE_INCLUDE,
    });

    return toExpenseRecord(row);
  });
}

/** Every expense in a household, newest expenseDate first, then newest created. */
export async function listForHousehold(
  householdId: string
): Promise<ExpenseRecord[]> {
  const rows = await getPrisma().expense.findMany({
    where: { householdId },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    include: EXPENSE_INCLUDE,
  });

  return rows.map(toExpenseRecord);
}

/**
 * One expense, or null when it does not exist *in this household*.
 *
 * Filtering on both ids means an expense id from another household is
 * indistinguishable from a made-up one.
 */
export async function findInHousehold(
  householdId: string,
  expenseId: string
): Promise<ExpenseRecord | null> {
  const row = await getPrisma().expense.findFirst({
    where: { id: expenseId, householdId },
    include: EXPENSE_INCLUDE,
  });

  return row ? toExpenseRecord(row) : null;
}
