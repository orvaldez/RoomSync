import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma";

/**
 * The role a member holds in a household.
 *
 * Declared here rather than imported from the generated Prisma client, for the
 * same reason `UserRecord` is: services depend on the repository's contract,
 * not on Prisma's types. The strings match the `MembershipRole` enum in the
 * schema and the values the API contract publishes (Section 2).
 */
export type MembershipRole = "OWNER" | "MEMBER";

export type HouseholdRecord = {
  id: string;
  name: string;
  createdAt: Date;
};

/** A household together with the requesting user's role in it. */
export type HouseholdWithRole = HouseholdRecord & { role: MembershipRole };

export type NewHousehold = {
  name: string;
  ownerUserId: string;
};

/**
 * The first key of every membership lock, so these locks cannot collide with
 * the ledger lock (41) or an advisory lock taken for any other purpose.
 */
const MEMBERSHIP_LOCK_NAMESPACE = 42;

/**
 * Take this user's membership lock for the rest of the transaction `tx`
 * (#73).
 *
 * The one-household-per-user rule is a check followed by a write, and two
 * requests for the same user — a double-clicked button, or two invitations
 * accepted at once — could both pass the check before either wrote. Every
 * write that adds a membership takes this lock first and checks inside it, so
 * those writes for one user happen one at a time and the second sees the
 * first. Other users never wait.
 *
 * A lock rather than `@@unique` on `Membership.userId`, which would turn the
 * post-MVP multi-household feature into a migration (analysis model §7). Like
 * the ledger lock, it is transaction-scoped, so it cannot be left held.
 */
export async function lockMemberships(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MEMBERSHIP_LOCK_NAMESPACE}::int, hashtext(${userId}))`;
}

/**
 * Create a household and the creator's OWNER membership in one transaction,
 * or return null if the creator already belongs to a household (UC-03 1a).
 *
 * UC-03 special requirement: these two writes are atomic. A household with no
 * membership row would be unreachable — nobody could list it, invite to it, or
 * delete it — so a partial write here is worse than no write at all.
 *
 * The one-household check runs under the creator's membership lock, in the
 * same transaction as the writes, so two concurrent creations cannot both
 * pass it (#73).
 */
export async function createWithOwner(
  household: NewHousehold
): Promise<HouseholdWithRole | null> {
  return getPrisma().$transaction(async (tx) => {
    await lockMemberships(tx, household.ownerUserId);

    if ((await tx.membership.count({ where: { userId: household.ownerUserId } })) > 0) {
      return null;
    }

    const created = await tx.household.create({
      data: { name: household.name },
    });

    const membership = await tx.membership.create({
      data: {
        userId: household.ownerUserId,
        householdId: created.id,
        role: "OWNER",
      },
    });

    return {
      id: created.id,
      name: created.name,
      createdAt: created.createdAt,
      role: membership.role as MembershipRole,
    };
  });
}

/**
 * The household this user belongs to, or null when they belong to none.
 *
 * The MVP allows one household per user, but that is a service-layer rule
 * rather than a database constraint (UC-03 extension 1a), so the query orders
 * by join time and takes the first. If the rule is ever relaxed for the
 * post-MVP multiple-households feature, this returns the oldest membership
 * instead of failing.
 */
export async function findCurrentForUser(
  userId: string
): Promise<HouseholdWithRole | null> {
  const membership = await getPrisma().membership.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    include: { household: true },
  });

  if (!membership) {
    return null;
  }

  return {
    id: membership.household.id,
    name: membership.household.name,
    createdAt: membership.household.createdAt,
    role: membership.role as MembershipRole,
  };
}

/**
 * This household with this user's role in it, or null when they are not a
 * member. Like `findRole`, null does not say which of "no such household" and
 * "not a member" applies (contract decision 5).
 */
export async function findWithRole(
  userId: string,
  householdId: string
): Promise<HouseholdWithRole | null> {
  const membership = await getPrisma().membership.findUnique({
    where: { userId_householdId: { userId, householdId } },
    include: { household: true },
  });

  if (!membership) {
    return null;
  }

  return {
    id: membership.household.id,
    name: membership.household.name,
    createdAt: membership.household.createdAt,
    role: membership.role as MembershipRole,
  };
}

/**
 * Whether this user already belongs to any household.
 *
 * Separate from `findCurrentForUser` because the caller only needs the answer,
 * not the record, and this avoids joining the household row to discard it.
 */
export async function hasMembership(userId: string): Promise<boolean> {
  const count = await getPrisma().membership.count({ where: { userId } });
  return count > 0;
}

/**
 * This user's role in this household, or null when they are not a member.
 *
 * Null covers both "no such household" and "not a member of it". The caller
 * treats them the same (contract decision 5), so there is no reason to spend
 * a second query telling them apart.
 */
export async function findRole(
  userId: string,
  householdId: string
): Promise<MembershipRole | null> {
  const membership = await getPrisma().membership.findUnique({
    where: { userId_householdId: { userId, householdId } },
    select: { role: true },
  });

  return membership ? (membership.role as MembershipRole) : null;
}

/** A household member with the account fields the contract exposes. */
export type MemberRecord = {
  userId: string;
  name: string;
  role: MembershipRole;
  joinedAt: Date;
};

/**
 * Every member of a household, earliest to join first.
 *
 * Selects only the user's name, never the whole user row: that row carries
 * the email and password hash, and `MemberPublic` deliberately exposes
 * neither (contract Section 2, NFR-06).
 */
export async function listMembers(
  householdId: string
): Promise<MemberRecord[]> {
  const memberships = await getPrisma().membership.findMany({
    where: { householdId },
    orderBy: { joinedAt: "asc" },
    select: {
      userId: true,
      role: true,
      joinedAt: true,
      user: { select: { name: true } },
    },
  });

  return memberships.map((membership) => ({
    userId: membership.userId,
    name: membership.user.name,
    role: membership.role as MembershipRole,
    joinedAt: membership.joinedAt,
  }));
}
