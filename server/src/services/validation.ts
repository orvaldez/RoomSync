/**
 * Input validation for the service layer. Pure functions with no I/O, so they
 * are cheap to test exhaustively.
 *
 * These run server-side regardless of what the client checks (NFR-07). The
 * client may duplicate them for a better experience, but is never trusted.
 */

export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt hashes at most 72 bytes of input and silently ignores the rest, so
 * two passwords sharing a 72-byte prefix would be interchangeable. Rejecting
 * longer input is clearer than truncating it without telling the user.
 */
export const PASSWORD_MAX_BYTES = 72;

/** Practical upper bound on an address (RFC 5321 path limit). */
export const EMAIL_MAX_LENGTH = 254;

export const NAME_MAX_LENGTH = 100;

/**
 * Deliberately permissive. The only addresses worth rejecting here are ones
 * that are obviously malformed; a stricter pattern rejects valid but unusual
 * addresses, and the only real proof an address works is sending mail to it.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lowercase and trim. Applied before both storage and lookup so that
 * `Alex@example.com` and `alex@example.com` resolve to one account — the
 * unique index alone is case-sensitive and would allow both.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateName(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "Name is required.";
  }
  if (value.trim().length > NAME_MAX_LENGTH) {
    return `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export function validateEmail(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "Email is required.";
  }
  const normalized = normalizeEmail(value);
  if (normalized.length > EMAIL_MAX_LENGTH) {
    return `Email must be ${EMAIL_MAX_LENGTH} characters or fewer.`;
  }
  if (!EMAIL_PATTERN.test(normalized)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function validatePassword(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return "Password is required.";
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  // Byte length, not character length: one emoji is four bytes, so a short
  // password can still exceed bcrypt's limit.
  if (Buffer.byteLength(value, "utf8") > PASSWORD_MAX_BYTES) {
    return `Password is too long (limit is ${PASSWORD_MAX_BYTES} bytes).`;
  }
  return null;
}

export const HOUSEHOLD_NAME_MAX_LENGTH = 100;

/**
 * Household name, per the API contract Section 4: 1-100 characters after trim.
 *
 * Separate from `validateName` even though the limits currently match, because
 * these name two different things — a person and a household — and a change to
 * one should not silently move the other.
 */
export function validateHouseholdName(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "Household name is required.";
  }
  if (value.trim().length > HOUSEHOLD_NAME_MAX_LENGTH) {
    return `Household name must be ${HOUSEHOLD_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

/**
 * The largest amount the database can store. Money columns are PostgreSQL
 * `integer` (Prisma `Int`), so a larger value would pass here and then fail on
 * insert with a far less useful error.
 */
export const MAX_AMOUNT_CENTS = 2_147_483_647;

/**
 * A money amount in integer cents (FR-18): a positive whole number.
 *
 * The client converts "$12.34" to `1234` before sending, so a fraction here is
 * a client bug or a hand-built request, and is rejected rather than rounded.
 */
export function validateAmountCents(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return "Amount must be a whole number of cents.";
  }
  if (value <= 0) {
    return "Amount must be greater than zero.";
  }
  if (value > MAX_AMOUNT_CENTS) {
    return "Amount is too large.";
  }
  return null;
}

export const EXPENSE_DESCRIPTION_MAX_LENGTH = 200;

/** Expense description, per the API contract: 1-200 characters after trim. */
export function validateExpenseDescription(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "Description is required.";
  }
  if (value.trim().length > EXPENSE_DESCRIPTION_MAX_LENGTH) {
    return `Description must be ${EXPENSE_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date the user picks, sent as `YYYY-MM-DD` (contract Section 1, "Dates").
 *
 * The round trip through `Date` catches dates that match the pattern but do
 * not exist, such as 2026-02-30, which `Date` would otherwise roll over into
 * March without complaint.
 */
export function validateCalendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !CALENDAR_DATE_PATTERN.test(value)) {
    return "Enter a date as YYYY-MM-DD.";
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return "Enter a real calendar date.";
  }

  return null;
}
