import * as choreRepository from "../repositories/chore.repository";
import * as householdRepository from "../repositories/household.repository";
import {
  AssigneeNotMemberError,
  ChoreAlreadyCompleteError,
  ChoreNotAssignedToYouError,
  ChoreNotFoundError,
  ValidationError,
} from "./errors";
import {
  validateCalendarDate,
  validateChoreDescription,
  validateChoreTitle,
} from "./validation";

/**
 * Household chores, per UC-09: create, assign, set a due date, complete.
 *
 * Every function takes the household id the `requireHouseholdMember` guard
 * already verified, so none of them check the requester's membership again.
 */

/** The request body for create and edit (contract Section 4, Chores). */
export type ChoreInput = {
  title?: unknown;
  description?: unknown;
  assignedUserId?: unknown;
  dueDate?: unknown;
};

/** The contract's `ChorePublic` (Section 2). */
export type PublicChore = {
  id: string;
  title: string;
  description: string | null;
  assignee: { userId: string; name: string } | null;
  /** `YYYY-MM-DD`, or null when the chore has no due date. */
  dueDate: string | null;
  isComplete: boolean;
  completedAt: Date | null;
  createdAt: Date;
};

export type ChoreStatusFilter = "open" | "completed";

/**
 * Create a chore, outstanding (UC-09 steps 1-6). Any member may create one,
 * and may assign it to any member, themselves included. A past due date is
 * accepted (4a); the client marks it overdue.
 */
export async function createChore(
  householdId: string,
  input: ChoreInput
): Promise<PublicChore> {
  const fields: Record<string, string> = {};

  const titleError = validateChoreTitle(input.title);
  if (titleError) fields.title = titleError;

  const descriptionError = validateChoreDescription(input.description);
  if (descriptionError) fields.description = descriptionError;

  const dueDateError = optionalDateError(input.dueDate);
  if (dueDateError) fields.dueDate = dueDateError;

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  const assignedUserId = await checkAssignee(householdId, input.assignedUserId);

  const chore = await choreRepository.create({
    householdId,
    title: (input.title as string).trim(),
    description: toDescription(input.description),
    assignedUserId,
    dueDate: toDueDate(input.dueDate),
  });

  return toPublicChore(chore);
}

/**
 * The household's chores. `open` is soonest due first with undated last;
 * `completed` is most recently completed first; no filter returns the open
 * ones followed by the completed ones.
 */
export async function listChores(
  householdId: string,
  status: unknown
): Promise<PublicChore[]> {
  if (status !== undefined && status !== "open" && status !== "completed") {
    throw new ValidationError({ status: 'Status must be "open" or "completed".' });
  }

  const [open, completed] = await Promise.all([
    status === "completed" ? [] : choreRepository.listOpen(householdId),
    status === "open" ? [] : choreRepository.listCompleted(householdId),
  ]);

  return [...open, ...completed].map(toPublicChore);
}

/**
 * Edit an outstanding chore: rename it, (re)assign or unassign it, or change or
 * clear its due date. Only the fields present in `input` change.
 */
export async function updateChore(
  householdId: string,
  choreId: string,
  input: ChoreInput
): Promise<PublicChore> {
  const existing = await findOrThrow(householdId, choreId);

  if (existing.isComplete) {
    throw new ChoreAlreadyCompleteError();
  }

  const fields: Record<string, string> = {};

  if (input.title !== undefined) {
    const titleError = validateChoreTitle(input.title);
    if (titleError) fields.title = titleError;
  }

  const descriptionError = validateChoreDescription(input.description);
  if (descriptionError) fields.description = descriptionError;

  if (input.dueDate !== undefined) {
    const dueDateError = optionalDateError(input.dueDate);
    if (dueDateError) fields.dueDate = dueDateError;
  }

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  const changes: choreRepository.ChoreChanges = {};
  if (input.title !== undefined) changes.title = (input.title as string).trim();
  if (input.description !== undefined) changes.description = toDescription(input.description);
  if (input.dueDate !== undefined) changes.dueDate = toDueDate(input.dueDate);
  if (input.assignedUserId !== undefined) {
    changes.assignedUserId = await checkAssignee(householdId, input.assignedUserId);
  }

  const updated = await choreRepository.updateOpen(householdId, choreId, changes);

  // Completed by someone else between our read and this write.
  if (!updated) {
    throw new ChoreAlreadyCompleteError();
  }

  return toPublicChore(updated);
}

/**
 * Mark a chore complete (UC-09 steps 8-11).
 *
 * Only the assigned member may (9a); an unassigned chore is anyone's (9b).
 * Completing a chore that is already complete returns it unchanged, keeping
 * the original completion time (8a).
 */
export async function completeChore(
  householdId: string,
  choreId: string,
  userId: string
): Promise<PublicChore> {
  const chore = await findOrThrow(householdId, choreId);

  if (chore.assignee && chore.assignee.userId !== userId) {
    throw new ChoreNotAssignedToYouError();
  }

  if (chore.isComplete) {
    return toPublicChore(chore);
  }

  const completed = await choreRepository.markComplete(householdId, choreId, new Date());

  if (!completed) {
    throw new ChoreNotFoundError();
  }

  return toPublicChore(completed);
}

async function findOrThrow(
  householdId: string,
  choreId: string
): Promise<choreRepository.ChoreRecord> {
  const chore = await choreRepository.findInHousehold(householdId, choreId);

  if (!chore) {
    throw new ChoreNotFoundError();
  }

  return chore;
}

/**
 * The assignee to store: null for "unassigned", or a member's id (UC-09 3a).
 * The contract does not list assignedUserId among the VALIDATION_FAILED fields,
 * so anything that is not a member of this household — a malformed value
 * included — is ASSIGNEE_NOT_MEMBER.
 */
async function checkAssignee(
  householdId: string,
  assignedUserId: unknown
): Promise<string | null> {
  if (assignedUserId === undefined || assignedUserId === null) {
    return null;
  }

  if (typeof assignedUserId !== "string" || assignedUserId.length === 0) {
    throw new AssigneeNotMemberError();
  }

  const role = await householdRepository.findRole(assignedUserId, householdId);
  if (!role) {
    throw new AssigneeNotMemberError();
  }

  return assignedUserId;
}

/** A due date is optional: absent and null both mean "none". */
function optionalDateError(value: unknown): string | null {
  return value === undefined || value === null ? null : validateCalendarDate(value);
}

function toDueDate(value: unknown): Date | null {
  return typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : null;
}

/** A blank description is stored as none, not as an empty string. */
function toDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toPublicChore(chore: choreRepository.ChoreRecord): PublicChore {
  return {
    id: chore.id,
    title: chore.title,
    description: chore.description,
    assignee: chore.assignee,
    // Stored at UTC midnight, so the UTC date is the date the member picked.
    dueDate: chore.dueDate ? chore.dueDate.toISOString().slice(0, 10) : null,
    isComplete: chore.isComplete,
    completedAt: chore.completedAt,
    createdAt: chore.createdAt,
  };
}
