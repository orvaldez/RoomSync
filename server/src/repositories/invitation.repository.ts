import { getPrisma } from "./prisma";
import { UniqueConstraintError, isUniqueViolation } from "./errors";
import { lockMemberships } from "./household.repository";

/**
 * Declared here rather than imported from the generated Prisma client, for the
 * same reason as `MembershipRole`: services depend on the repository's
 * contract, not on Prisma's types. The strings match the schema's enum.
 */
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export type InvitationRecord = {
  id: string;
  householdId: string;
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
};

/** An invitation with the household it is for. */
export type InvitationWithHousehold = InvitationRecord & {
  household: { id: string; name: string; createdAt: Date };
};

export type NewInvitation = {
  householdId: string;
  token: string;
  expiresAt: Date;
};

function toInvitationRecord(row: {
  id: string;
  householdId: string;
  token: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}): InvitationRecord {
  return {
    id: row.id,
    householdId: row.householdId,
    token: row.token,
    status: row.status as InvitationStatus,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export async function create(invitation: NewInvitation): Promise<InvitationRecord> {
  const row = await getPrisma().invitation.create({
    data: {
      householdId: invitation.householdId,
      token: invitation.token,
      expiresAt: invitation.expiresAt,
    },
  });

  return toInvitationRecord(row);
}

/** The invitation with this token, whatever its status, or null. */
export async function findByToken(
  token: string
): Promise<InvitationWithHousehold | null> {
  const row = await getPrisma().invitation.findUnique({
    where: { token },
    include: { household: { select: { id: true, name: true, createdAt: true } } },
  });

  if (!row) {
    return null;
  }

  return { ...toInvitationRecord(row), household: row.household };
}

/**
 * Record that a pending invitation has expired (UC-04 6b). Only moves it from
 * PENDING, so an invitation that was accepted in the meantime keeps that
 * status.
 */
export async function markExpired(invitationId: string): Promise<void> {
  await getPrisma().invitation.updateMany({
    where: { id: invitationId, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
}

/**
 * What `acceptIntoHousehold` did: joined, found the invitation no longer
 * usable, or found the user already in a different household.
 */
export type AcceptOutcome = "JOINED" | "INVITATION_UNAVAILABLE" | "ALREADY_IN_HOUSEHOLD";

/**
 * Claim the invitation and add the user to its household as a MEMBER, in one
 * transaction (UC-04 steps 10-11).
 *
 * The user's membership lock is taken first and the one-household rule
 * checked under it, so two invitations accepted at once, or an accept racing
 * a household creation, cannot leave the user in two households (#73). A
 * user already elsewhere gets "ALREADY_IN_HOUSEHOLD", and the invitation is
 * left unused.
 *
 * The claim is a conditional update — only a PENDING, unexpired invitation
 * changes — so two people accepting the same link at once cannot both get in:
 * the second update matches nothing, and this returns
 * "INVITATION_UNAVAILABLE". It also means a membership is never created
 * without its invitation being marked ACCEPTED, or the other way round.
 *
 * Throws `UniqueConstraintError` when the user is already a member of this
 * household, having joined between the caller's check and this write.
 */
export async function acceptIntoHousehold(accept: {
  invitationId: string;
  userId: string;
  householdId: string;
}): Promise<AcceptOutcome> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      await lockMemberships(tx, accept.userId);

      const memberships = await tx.membership.findMany({
        where: { userId: accept.userId },
        select: { householdId: true },
      });
      if (memberships.some((m) => m.householdId === accept.householdId)) {
        throw new UniqueConstraintError("membership");
      }
      if (memberships.length > 0) {
        return "ALREADY_IN_HOUSEHOLD";
      }

      const claimed = await tx.invitation.updateMany({
        where: {
          id: accept.invitationId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        data: { status: "ACCEPTED" },
      });

      if (claimed.count === 0) {
        return "INVITATION_UNAVAILABLE";
      }

      await tx.membership.create({
        data: {
          userId: accept.userId,
          householdId: accept.householdId,
          role: "MEMBER",
        },
      });

      return "JOINED";
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw error;
    }
    if (isUniqueViolation(error)) {
      throw new UniqueConstraintError("membership");
    }
    throw error;
  }
}
