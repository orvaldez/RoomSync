import bcrypt from "bcryptjs";
import * as userRepository from "../repositories/user.repository";
import { UniqueConstraintError } from "../repositories/errors";
import {
  EmailTakenError,
  InvalidCredentialsError,
  ValidationError,
} from "./errors";
import {
  normalizeEmail,
  validateEmail,
  validateName,
  validatePassword,
} from "./validation";

/**
 * Registration, per UC-01.
 *
 * bcryptjs rather than bcrypt: bcrypt is a native module requiring a build
 * toolchain, and docs/security/dependency-audit.md records that a native
 * binding is already blocked by Windows Application Control on a team
 * member's machine. bcryptjs is the same algorithm in pure JavaScript, so it
 * installs identically everywhere at the cost of some speed on hashing —
 * which happens twice per session, not per request.
 */
export const BCRYPT_COST = 10;

/** A user as the rest of the application sees one. Never includes the hash. */
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

export type RegisterInput = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
};

function toPublicUser(user: userRepository.UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export async function register(input: RegisterInput): Promise<PublicUser> {
  const fields: Record<string, string> = {};

  const nameError = validateName(input.name);
  if (nameError) fields.name = nameError;

  const emailError = validateEmail(input.email);
  if (emailError) fields.email = emailError;

  const passwordError = validatePassword(input.password);
  if (passwordError) fields.password = passwordError;

  // Report every bad field at once rather than one per round trip.
  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  const name = (input.name as string).trim();
  const email = normalizeEmail(input.email as string);
  const password = input.password as string;

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    // UC-01 extension 4a: say nothing about whether this address is
    // registered. The 409 status still narrows it down for anyone probing
    // deliberately — closing that gap entirely needs email verification,
    // which the MVP does not have. Flagged for the Milestone 2 threat model.
    throw new EmailTakenError();
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    const user = await userRepository.create({ name, email, passwordHash });
    return toPublicUser(user);
  } catch (error) {
    // The availability check above is not a lock. Two concurrent registrations
    // of the same address both pass it, and the unique index rejects the
    // second. Report that as the same 409 the first check would have produced,
    // not a 500.
    if (error instanceof UniqueConstraintError && error.field === "email") {
      throw new EmailTakenError();
    }
    throw error;
  }
}

export type LoginInput = {
  email?: unknown;
  password?: unknown;
};

/**
 * A bcrypt hash of a throwaway value, used to spend the same time verifying a
 * password when no account matched as when one did. Without it, a login for an
 * unknown address returns measurably faster than one with a wrong password,
 * and that timing difference reveals which addresses are registered — the same
 * leak UC-02 extensions 3a and 4a close in the response body.
 *
 * Generated once at module load rather than per request.
 */
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", BCRYPT_COST);

/**
 * Log in, per UC-02 steps 3-4.
 *
 * Returns the user on success. Does not create the session — that is the
 * route's job, because sessions are an HTTP concern and services know nothing
 * about HTTP (ADR-001).
 */
export async function login(input: LoginInput): Promise<PublicUser> {
  const fields: Record<string, string> = {};

  // Presence only. Applying the registration rules here would reject a
  // legitimate attempt by someone whose password predates a rule change, and
  // would report "password must be 8 characters" to whoever is guessing.
  if (typeof input.email !== "string" || input.email.trim().length === 0) {
    fields.email = "Email is required.";
  }
  if (typeof input.password !== "string" || input.password.length === 0) {
    fields.password = "Password is required.";
  }

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  const email = normalizeEmail(input.email as string);
  const password = input.password as string;

  const user = await userRepository.findByEmail(email);

  // Compare against the dummy hash when there is no user, so both paths cost
  // the same. Assigning the result keeps a compiler or runtime from eliding
  // the call.
  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_HASH
  );

  if (!user || !passwordMatches) {
    throw new InvalidCredentialsError();
  }

  return toPublicUser(user);
}

/** Look up the signed-in user for `GET /api/auth/me`. */
export async function findCurrentUser(
  userId: string
): Promise<PublicUser | null> {
  const user = await userRepository.findById(userId);
  return user ? toPublicUser(user) : null;
}
