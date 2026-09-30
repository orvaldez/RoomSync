/**
 * Errors the service layer raises.
 *
 * Each one carries the status and the `code` from the API contract's error
 * catalog (docs/design/api-contract.md, Section 5). Routes do not build error
 * bodies by hand — they hand the error to the error middleware, which turns it
 * into the single `{ error: { code, message } }` shape the contract defines.
 */

export abstract class AppError extends Error {
  /** Error code from the contract's catalog. */
  abstract readonly code: string;
  /** HTTP status the contract maps this code to. */
  abstract readonly status: number;

  /**
   * Extra detail merged into the error body. Only VALIDATION_FAILED uses it,
   * for the per-field map the registration form renders; every other error is
   * exactly `{ code, message }`.
   */
  details(): Record<string, unknown> | undefined {
    return undefined;
  }
}

/** 400 — one or more input fields failed validation. */
export class ValidationError extends AppError {
  readonly code = "VALIDATION_FAILED";
  readonly status = 400;
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Validation failed");
    this.name = "ValidationError";
    this.fields = fields;
  }

  override details(): Record<string, unknown> {
    return { fields: this.fields };
  }
}

/**
 * 409 — the email is already registered.
 *
 * The message deliberately says nothing about the address. See the note in
 * auth.service.ts on account enumeration.
 */
export class EmailTakenError extends AppError {
  readonly code = "EMAIL_UNAVAILABLE";
  readonly status = 409;

  constructor() {
    super("Registration could not be completed.");
    this.name = "EmailTakenError";
  }
}

/**
 * 401 — the email and password did not match an account.
 *
 * Deliberately one error for both "no such account" and "wrong password".
 * Distinguishing them tells an unauthenticated caller which addresses are
 * registered (UC-02 extensions 3a and 4a).
 */
export class InvalidCredentialsError extends AppError {
  readonly code = "INVALID_CREDENTIALS";
  readonly status = 401;

  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}

/** 401 — the endpoint requires a session and the request has none. */
export class UnauthenticatedError extends AppError {
  readonly code = "UNAUTHENTICATED";
  readonly status = 401;

  constructor() {
    super("You must be logged in to do that.");
    this.name = "UnauthenticatedError";
  }
}

/**
 * 409 — the requester already belongs to a household.
 *
 * The MVP supports one active household per user (UC-03 extension 1a). This is
 * enforced here rather than with a database constraint, so the post-MVP
 * multiple-households feature does not require a migration.
 */
export class AlreadyInHouseholdError extends AppError {
  readonly code = "ALREADY_IN_HOUSEHOLD";
  readonly status = 409;

  constructor() {
    super("You already belong to a household.");
    this.name = "AlreadyInHouseholdError";
  }
}

/**
 * 404 — the household does not exist, or the requester is not a member of it.
 *
 * One error for both on purpose (contract decision 5). Answering 403 to a
 * non-member would confirm that the household exists, and household ids appear
 * in URLs that get shared.
 */
export class HouseholdNotFoundError extends AppError {
  readonly code = "HOUSEHOLD_NOT_FOUND";
  readonly status = 404;

  constructor() {
    super("Household not found.");
    this.name = "HouseholdNotFoundError";
  }
}

/** 400 — an expense split names no participants (UC-05 4a, UC-06 E1a). */
export class NoParticipantsError extends AppError {
  readonly code = "NO_PARTICIPANTS";
  readonly status = 400;

  constructor() {
    super("Select at least one participant.");
    this.name = "NoParticipantsError";
  }
}

/**
 * 400 — the same member appears twice in one split.
 *
 * Rejected rather than merged: the schema allows one share per member per
 * expense, and silently combining two entries would hide a client bug.
 */
export class DuplicateParticipantError extends AppError {
  readonly code = "DUPLICATE_PARTICIPANT";
  readonly status = 400;

  constructor() {
    super("A participant appears more than once.");
    this.name = "DuplicateParticipantError";
  }
}

/**
 * 400 — custom split amounts do not add up to the expense total (UC-06 C3a).
 *
 * The split is rejected, never adjusted: quietly moving a cent onto someone's
 * share would change what they owe without them seeing it.
 */
export class SplitSumMismatchError extends AppError {
  readonly code = "SPLIT_SUM_MISMATCH";
  readonly status = 400;

  constructor() {
    super("Custom amounts must add up to the total.");
    this.name = "SplitSumMismatchError";
  }
}

/** 400 — percentage split basis points do not sum to 10000 (UC-06 P3a). */
export class PercentSumInvalidError extends AppError {
  readonly code = "PERCENT_SUM_INVALID";
  readonly status = 400;

  constructor() {
    super("Percentages must add up to 100.");
    this.name = "PercentSumInvalidError";
  }
}

/** 400 — the expense's payer does not belong to this household (UC-05 3a). */
export class PayerNotMemberError extends AppError {
  readonly code = "PAYER_NOT_MEMBER";
  readonly status = 400;

  constructor() {
    super("The payer must be a household member.");
    this.name = "PayerNotMemberError";
  }
}

/** 400 — a participant in the split does not belong to this household. */
export class ParticipantNotMemberError extends AppError {
  readonly code = "PARTICIPANT_NOT_MEMBER";
  readonly status = 400;

  constructor() {
    super("Every participant must be a household member.");
    this.name = "ParticipantNotMemberError";
  }
}

/**
 * 404 — no expense with this id in this household.
 *
 * An expense that exists in a different household gets the same answer, so a
 * member cannot confirm another household's expense ids.
 */
export class ExpenseNotFoundError extends AppError {
  readonly code = "EXPENSE_NOT_FOUND";
  readonly status = 404;

  constructor() {
    super("Expense not found.");
    this.name = "ExpenseNotFoundError";
  }
}
