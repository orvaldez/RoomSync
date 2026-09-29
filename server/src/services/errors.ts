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
