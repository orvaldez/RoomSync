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
