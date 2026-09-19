/**
 * Errors the service layer raises so routes can map them to status codes
 * without knowing anything about the business rules that produced them.
 */

/** One or more input fields failed validation. Maps to 400. */
export class ValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Validation failed");
    this.name = "ValidationError";
    this.fields = fields;
  }
}

/**
 * The email is already registered. Maps to 409.
 *
 * The message deliberately says nothing about the address. See the note in
 * auth.service.ts on account enumeration.
 */
export class EmailTakenError extends Error {
  constructor() {
    super("Registration could not be completed");
    this.name = "EmailTakenError";
  }
}
