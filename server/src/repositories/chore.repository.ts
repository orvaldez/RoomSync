import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma";

export type ChoreRecord = {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  assignee: { userId: string; name: string } | null;
  dueDate: Date | null;
  isComplete: boolean;
  completedAt: Date | null;
  createdAt: Date;
};

export type NewChore = {
  householdId: string;
  title: string;
  description: string | null;
  assignedUserId: string | null;
  dueDate: Date | null;
};

/** Fields an edit may change. Absent means "leave as is"; null clears it. */
export type ChoreChanges = {
  title?: string;
  description?: string | null;
  assignedUserId?: string | null;
  dueDate?: Date | null;
};

/**
 * Loads the assignee's name alongside the chore — only the name, never the
 * whole user row, which carries the email and password hash (NFR-06).
 */
const CHORE_INCLUDE = {
  assignedUser: { select: { name: true } },
} satisfies Prisma.ChoreInclude;

type ChoreRow = Prisma.ChoreGetPayload<{ include: typeof CHORE_INCLUDE }>;

function toChoreRecord(row: ChoreRow): ChoreRecord {
  return {
    id: row.id,
    householdId: row.householdId,
    title: row.title,
    description: row.description,
    assignee:
      row.assignedUserId && row.assignedUser
        ? { userId: row.assignedUserId, name: row.assignedUser.name }
        : null,
    dueDate: row.dueDate,
    isComplete: row.isComplete,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  };
}

export async function create(chore: NewChore): Promise<ChoreRecord> {
  const row = await getPrisma().chore.create({
    data: chore,
    include: CHORE_INCLUDE,
  });

  return toChoreRecord(row);
}

/**
 * Outstanding chores, soonest due first with undated ones last, then oldest
 * created first among equals (contract: "open").
 */
export async function listOpen(householdId: string): Promise<ChoreRecord[]> {
  const rows = await getPrisma().chore.findMany({
    where: { householdId, isComplete: false },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: CHORE_INCLUDE,
  });

  return rows.map(toChoreRecord);
}

/** Outstanding chores assigned to this member, in the same order as `listOpen`. */
export async function listOpenAssignedTo(
  householdId: string,
  userId: string
): Promise<ChoreRecord[]> {
  const rows = await getPrisma().chore.findMany({
    where: { householdId, isComplete: false, assignedUserId: userId },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: CHORE_INCLUDE,
  });

  return rows.map(toChoreRecord);
}

/**
 * Completed chores, most recently completed first (contract: "completed").
 * `limit` caps the rows read, for callers that only show the latest few.
 */
export async function listCompleted(
  householdId: string,
  limit?: number
): Promise<ChoreRecord[]> {
  const rows = await getPrisma().chore.findMany({
    where: { householdId, isComplete: true },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: CHORE_INCLUDE,
  });

  return rows.map(toChoreRecord);
}

/**
 * One chore, or null when it does not exist *in this household*. Filtering on
 * both ids makes a chore id from another household indistinguishable from a
 * made-up one.
 */
export async function findInHousehold(
  householdId: string,
  choreId: string
): Promise<ChoreRecord | null> {
  const row = await getPrisma().chore.findFirst({
    where: { id: choreId, householdId },
    include: CHORE_INCLUDE,
  });

  return row ? toChoreRecord(row) : null;
}

/**
 * Apply edits to an outstanding chore. Returns null when the chore was
 * completed (or removed) since the caller looked, so an edit can never land on
 * a finished chore — the conditional `isComplete: false` makes that check and
 * the write one statement.
 */
export async function updateOpen(
  householdId: string,
  choreId: string,
  changes: ChoreChanges
): Promise<ChoreRecord | null> {
  const { count } = await getPrisma().chore.updateMany({
    where: { id: choreId, householdId, isComplete: false },
    data: changes,
  });

  return count === 0 ? null : findInHousehold(householdId, choreId);
}

/**
 * Mark a chore complete at `at` (UC-09 step 10).
 *
 * Only an outstanding chore changes, so completing it twice — a double click,
 * or two tabs — keeps the first completion time rather than overwriting it
 * (UC-09 8a). Returns the chore as it now stands either way.
 */
export async function markComplete(
  householdId: string,
  choreId: string,
  at: Date
): Promise<ChoreRecord | null> {
  await getPrisma().chore.updateMany({
    where: { id: choreId, householdId, isComplete: false },
    data: { isComplete: true, completedAt: at },
  });

  return findInHousehold(householdId, choreId);
}
