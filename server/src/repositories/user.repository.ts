import { getPrisma } from "./prisma";

/**
 * A user as stored. `passwordHash` is included because the auth service needs
 * it to verify a login (US-02); it is stripped before anything leaves the
 * service layer. Nothing above the service layer should ever see this type.
 *
 * Declared here rather than imported from the generated Prisma client so that
 * services depend on the repository's own contract, not on Prisma's types.
 * That keeps ADR-001's layering honest: swapping the ORM would change this
 * file and nothing above it.
 */
export type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

export type NewUser = {
  name: string;
  email: string;
  passwordHash: string;
};

/**
 * Look up a user by email. The caller normalizes the address first — this
 * does an exact match, because the column has a unique index and a
 * case-insensitive comparison here would not use it.
 */
export async function findByEmail(email: string): Promise<UserRecord | null> {
  return getPrisma().user.findUnique({ where: { email } });
}

export async function findById(id: string): Promise<UserRecord | null> {
  return getPrisma().user.findUnique({ where: { id } });
}

export async function create(user: NewUser): Promise<UserRecord> {
  return getPrisma().user.create({ data: user });
}
