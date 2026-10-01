import * as expenseRepository from "../repositories/expense.repository";
import * as householdRepository from "../repositories/household.repository";
import {
  ExpenseNotFoundError,
  ParticipantNotMemberError,
  PayerNotMemberError,
  ValidationError,
} from "./errors";
import {
  splitExpense,
  splitFieldErrors,
  type SplitInput,
  type SplitMethod,
} from "./split.service";
import { validateCalendarDate, validateExpenseDescription } from "./validation";

/**
 * Recording shared expenses, per UC-05. The splitting itself is UC-06 and
 * lives in `split.service`; this service validates the expense around it,
 * checks everyone named belongs to the household, and stores the result.
 *
 * Every function takes the household id the `requireHouseholdMember` guard
 * already verified. None of them check membership of the requester again.
 */

/** The expense body, as the client sent it (contract Section 4, "Expense body"). */
export type ExpenseInput = {
  description?: unknown;
  totalAmountCents?: unknown;
  expenseDate?: unknown;
  paidByUserId?: unknown;
  splitMethod?: unknown;
  participants?: unknown;
};

/** The contract's `SharePublic` (Section 2). */
export type PublicShare = {
  userId: string;
  name: string;
  amountOwedCents: number;
  percentBasisPoints: number | null;
};

/** The contract's `ExpensePublic` (Section 2). */
export type PublicExpense = {
  id: string;
  description: string;
  totalAmountCents: number;
  /** `YYYY-MM-DD`, the calendar date the user picked. */
  expenseDate: string;
  paidBy: { userId: string; name: string };
  splitMethod: SplitMethod;
  shares: PublicShare[];
  createdAt: Date;
};

/** An expense that passed every check, with its shares calculated. */
type CheckedExpense = {
  description: string;
  totalAmountCents: number;
  expenseDate: string;
  paidByUserId: string;
  splitMethod: SplitMethod;
  shares: PublicShare[];
};

/**
 * Calculates the shares without storing anything, so the client can show them
 * before the member confirms (UC-05 step 7). The server stays the only place
 * shares are calculated.
 */
export async function previewExpense(
  householdId: string,
  input: ExpenseInput
): Promise<PublicShare[]> {
  const expense = await checkExpense(householdId, input);
  return expense.shares;
}

/**
 * Validates, splits and stores an expense (UC-05).
 *
 * Nothing is written unless every check passes, including the split's own
 * guarantee that the shares sum exactly to the total (UC-05 9a). The expense
 * and its shares are then written in one transaction (UC-05 10a).
 */
export async function createExpense(
  householdId: string,
  input: ExpenseInput
): Promise<PublicExpense> {
  const expense = await checkExpense(householdId, input);

  const record = await expenseRepository.createWithShares({
    householdId,
    description: expense.description,
    totalAmountCents: expense.totalAmountCents,
    expenseDate: new Date(`${expense.expenseDate}T00:00:00.000Z`),
    paidByUserId: expense.paidByUserId,
    splitMethod: expense.splitMethod,
    shares: expense.shares.map((share) => ({
      userId: share.userId,
      amountOwedCents: share.amountOwedCents,
      percentBasisPoints: share.percentBasisPoints,
    })),
  });

  return toPublicExpense(record);
}

/** Every expense in the household, newest expenseDate first, then newest created. */
export async function listExpenses(householdId: string): Promise<PublicExpense[]> {
  const records = await expenseRepository.listForHousehold(householdId);
  return records.map(toPublicExpense);
}

/** The most recently recorded expenses, newest first, at most `limit` (UC-10 step 6). */
export async function listRecentExpenses(
  householdId: string,
  limit: number
): Promise<PublicExpense[]> {
  const records = await expenseRepository.listRecent(householdId, limit);
  return records.map(toPublicExpense);
}

/** One expense, or `EXPENSE_NOT_FOUND` when this household has no such expense. */
export async function getExpense(
  householdId: string,
  expenseId: string
): Promise<PublicExpense> {
  const record = await expenseRepository.findInHousehold(householdId, expenseId);

  if (!record) {
    throw new ExpenseNotFoundError();
  }

  return toPublicExpense(record);
}

/**
 * Every check an expense must pass before it is stored, shared by preview and
 * create so the two can never disagree about what is valid.
 *
 * Order: field errors first, all together; then membership (UC-05 3a); then
 * the split's own rules, which include at least one participant (UC-05 4a),
 * no duplicates, and custom amounts or percentages that add up.
 */
async function checkExpense(
  householdId: string,
  input: ExpenseInput
): Promise<CheckedExpense> {
  const fields: Record<string, string> = {};

  const descriptionError = validateExpenseDescription(input.description);
  if (descriptionError) fields.description = descriptionError;

  const dateError = validateCalendarDate(input.expenseDate);
  if (dateError) fields.expenseDate = dateError;

  Object.assign(fields, splitFieldErrors(input));

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  // Past this point the fields have the shapes splitFieldErrors checked for.
  const split = {
    totalAmountCents: input.totalAmountCents,
    splitMethod: input.splitMethod,
    participants: input.participants,
  } as SplitInput;

  // One query answers both membership questions and supplies the names the
  // response needs. Member removal is post-MVP, so a member cannot leave
  // between this read and the write below.
  const members = await householdRepository.listMembers(householdId);
  const nameOf = new Map(members.map((member) => [member.userId, member.name]));

  // The contract does not list paidByUserId among the VALIDATION_FAILED
  // fields: a missing or malformed payer is simply not a member.
  if (typeof input.paidByUserId !== "string" || !nameOf.has(input.paidByUserId)) {
    throw new PayerNotMemberError();
  }

  if (!split.participants.every((p) => nameOf.has(p.userId))) {
    throw new ParticipantNotMemberError();
  }

  const shares = splitExpense(split);

  return {
    description: (input.description as string).trim(),
    totalAmountCents: split.totalAmountCents,
    expenseDate: input.expenseDate as string,
    paidByUserId: input.paidByUserId,
    splitMethod: split.splitMethod,
    shares: shares.map((share) => ({
      userId: share.userId,
      name: nameOf.get(share.userId) as string,
      amountOwedCents: share.amountOwedCents,
      percentBasisPoints: share.percentBasisPoints,
    })),
  };
}

function toPublicExpense(record: expenseRepository.ExpenseRecord): PublicExpense {
  return {
    id: record.id,
    description: record.description,
    totalAmountCents: record.totalAmountCents,
    // Stored at UTC midnight, so the UTC date is the date the user picked.
    expenseDate: record.expenseDate.toISOString().slice(0, 10),
    paidBy: record.paidBy,
    splitMethod: record.splitMethod,
    shares: record.shares.map((share) => ({
      userId: share.userId,
      name: share.name,
      amountOwedCents: share.amountOwedCents,
      percentBasisPoints: share.percentBasisPoints,
    })),
    createdAt: record.createdAt,
  };
}
