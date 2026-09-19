import bcrypt from "bcryptjs";
import * as userRepository from "../repositories/user.repository";
import { EmailTakenError, ValidationError } from "./errors";
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
const BCRYPT_COST = 10;

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

  const user = await userRepository.create({ name, email, passwordHash });

  return toPublicUser(user);
}
