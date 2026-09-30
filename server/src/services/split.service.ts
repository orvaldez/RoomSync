/**
 * Expense splitting (UC-06). Pure functions: no I/O, no Prisma, no HTTP, so
 * the rounding rules can be tested exhaustively without a database.
 *
 * Each split method is a strategy with the same signature. `splitExpense`
 * validates what all three share, picks the strategy, and then checks the
 * result sums exactly to the total no matter which one ran (FR-09, SC-04). A
 * bug in one strategy therefore fails the request instead of storing an
 * expense whose shares drift from its total.
 *
 * All arithmetic is integer cents and integer basis points (FR-18). The rules
 * are the API contract's, Section 4, "Split rules".
 */

import {
  DuplicateParticipantError,
  NoParticipantsError,
  PercentSumInvalidError,
  SplitSumMismatchError,
  ValidationError,
} from "./errors";
import { validateAmountCents } from "./validation";

export type SplitMethod = "EQUAL" | "CUSTOM" | "PERCENTAGE";

export const SPLIT_METHODS: readonly SplitMethod[] = [
  "EQUAL",
  "CUSTOM",
  "PERCENTAGE",
];

/** 100%, in basis points. */
export const FULL_BASIS_POINTS = 10_000;

export type SplitParticipant = {
  userId: string;
  /** Required for CUSTOM, ignored otherwise. */
  amountCents?: number;
  /** Required for PERCENTAGE, ignored otherwise. */
  percentBasisPoints?: number;
};

export type SplitInput = {
  totalAmountCents: number;
  splitMethod: SplitMethod;
  /** In the order the client sent them, which decides who gets remainder cents. */
  participants: SplitParticipant[];
};

/** One participant's portion. Matches the schema's `ExpenseShare` columns. */
export type Share = {
  userId: string;
  amountOwedCents: number;
  /** Set only for PERCENTAGE splits. */
  percentBasisPoints: number | null;
};

type SplitStrategy = (
  totalCents: number,
  participants: SplitParticipant[]
) => Share[];

/**
 * Splits an expense into one share per participant.
 *
 * Throws `ValidationError`, `NoParticipantsError`,
 * `DuplicateParticipantError`, `SplitSumMismatchError` or
 * `PercentSumInvalidError`, matching the contract's codes for
 * `POST /expenses` and `POST /expenses/preview`. Membership of the payer and
 * participants is not checked here; that needs the database and belongs to
 * the expense service.
 */
export function splitExpense(input: SplitInput): Share[] {
  const { totalAmountCents, splitMethod, participants } = input;

  const fields = splitFieldErrors(input);
  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  if (participants.length === 0) {
    throw new NoParticipantsError();
  }

  const userIds = new Set(participants.map((p) => p.userId));
  if (userIds.size !== participants.length) {
    throw new DuplicateParticipantError();
  }

  const shares = strategies[splitMethod](totalAmountCents, participants);
  assertSharesMatchTotal(shares, totalAmountCents);
  return shares;
}

/**
 * The field-level problems with a split's inputs, keyed by the contract's
 * field names; empty when there are none.
 *
 * Exported so the expense service can merge these with its own field errors
 * and report every invalid field in one response, rather than one per submit.
 */
export function splitFieldErrors(input: {
  totalAmountCents?: unknown;
  splitMethod?: unknown;
  participants?: unknown;
}): Record<string, string> {
  const fields: Record<string, string> = {};

  const totalError = validateAmountCents(input.totalAmountCents);
  if (totalError) fields.totalAmountCents = totalError;

  if (!isSplitMethod(input.splitMethod)) {
    fields.splitMethod = "Choose equal, custom or percentage.";
  }

  if (
    !Array.isArray(input.participants) ||
    !input.participants.every(isParticipant)
  ) {
    fields.participants = "Choose who took part in this expense.";
  }

  return fields;
}

/**
 * EQUAL (UC-06 E1-E4): `floor(total / n)` each, with the remainder handed out
 * one cent at a time in request order. $100.00 across three is 3334, 3333,
 * 3333 — summing to 10000, not 9999.
 */
const splitEqually: SplitStrategy = (totalCents, participants) => {
  const base = intDiv(totalCents, participants.length);
  const amounts = participants.map(() => base);

  distributeRemainder(amounts, totalCents - base * participants.length);

  return participants.map((p, i) => ({
    userId: p.userId,
    amountOwedCents: amounts[i],
    percentBasisPoints: null,
  }));
};

/**
 * CUSTOM (UC-06 C1-C4): the amounts given, used exactly as given. They must
 * sum to the total; nothing is adjusted to make them fit (C3a). A zero amount
 * is allowed — someone can be part of an expense and owe nothing for it.
 */
const splitByAmount: SplitStrategy = (totalCents, participants) => {
  const amounts = participants.map((p) => p.amountCents);

  if (!amounts.every(isNonNegativeInteger)) {
    throw new ValidationError({
      participants: "Enter an amount of zero or more for each participant.",
    });
  }

  if (sum(amounts) !== totalCents) {
    throw new SplitSumMismatchError();
  }

  return participants.map((p, i) => ({
    userId: p.userId,
    amountOwedCents: amounts[i],
    percentBasisPoints: null,
  }));
};

/**
 * PERCENTAGE (UC-06 P1-P6): basis points summing to exactly 10000. Each share
 * is `floor(total * bp / 10000)`, and the remainder is handed out as in EQUAL.
 *
 * Remainder cents skip participants at 0%: someone who owes nothing should
 * not end up owing a cent because they were listed first. This never leaves a
 * cent unassigned — the remainder is the sum of the fractional parts dropped
 * by `floor`, so it is always smaller than the number of participants with a
 * non-zero percentage.
 */
const splitByPercentage: SplitStrategy = (totalCents, participants) => {
  const points = participants.map((p) => p.percentBasisPoints);

  if (!points.every(isNonNegativeInteger)) {
    throw new ValidationError({
      participants: "Enter a percentage of zero or more for each participant.",
    });
  }

  if (sum(points) !== FULL_BASIS_POINTS) {
    throw new PercentSumInvalidError();
  }

  // total <= MAX_AMOUNT_CENTS and bp <= 10000, so the product stays well
  // inside the range where JavaScript numbers are exact integers.
  const amounts = points.map((bp) => intDiv(totalCents * bp, FULL_BASIS_POINTS));

  distributeRemainder(amounts, totalCents - sum(amounts), (i) => points[i] > 0);

  return participants.map((p, i) => ({
    userId: p.userId,
    amountOwedCents: amounts[i],
    percentBasisPoints: points[i],
  }));
};

const strategies: Record<SplitMethod, SplitStrategy> = {
  EQUAL: splitEqually,
  CUSTOM: splitByAmount,
  PERCENTAGE: splitByPercentage,
};

/**
 * Adds `remainder` cents one at a time, in request order, to the amounts
 * `eligible` allows (contract decision 3). Deterministic, so the same input
 * always produces the same shares. Callers guarantee the remainder is smaller
 * than the number of eligible amounts, so one pass is enough; if that ever
 * stops being true, `assertSharesMatchTotal` catches it.
 */
function distributeRemainder(
  amounts: number[],
  remainder: number,
  eligible: (index: number) => boolean = () => true
): void {
  for (let i = 0; i < amounts.length && remainder > 0; i++) {
    if (eligible(i)) {
      amounts[i] += 1;
      remainder -= 1;
    }
  }
}

/**
 * The unconditional check from UC-05 9a. Every strategy is supposed to make
 * this hold; if one does not, that is a bug in this file rather than bad
 * input, so it is a plain Error — a 500 that stores nothing — not a 400
 * blaming the user.
 */
function assertSharesMatchTotal(shares: Share[], totalCents: number): void {
  const amounts = shares.map((s) => s.amountOwedCents);

  if (!amounts.every(isNonNegativeInteger) || sum(amounts) !== totalCents) {
    throw new Error(
      `Split produced shares [${amounts.join(", ")}] for a total of ${totalCents}.`
    );
  }
}

function isSplitMethod(value: unknown): value is SplitMethod {
  return SPLIT_METHODS.includes(value as SplitMethod);
}

function isParticipant(value: unknown): value is SplitParticipant {
  if (typeof value !== "object" || value === null) return false;
  const { userId } = value as { userId?: unknown };
  return typeof userId === "string" && userId.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Integer division of non-negative integers, exact without floating point. */
function intDiv(dividend: number, divisor: number): number {
  return (dividend - (dividend % divisor)) / divisor;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
