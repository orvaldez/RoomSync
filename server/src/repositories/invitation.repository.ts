import { getPrisma } from "./prisma";
import { UniqueConstraintError, isUniqueViolation } from "./errors";

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
 * The household's invitations that can still be accepted: PENDING and not yet
 * past `expiresAt`, newest first (UC-14 step 2). A pending invitation whose
 * time has run out is left out even though its stored status has not caught
 * up yet, since it is no longer a live link.
 */
export async function listPending(householdId: string): Promise<InvitationRecord[]> {
  const rows = await getPrisma().invitation.findMany({
    where: { householdId, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  return rows.map(toInvitationRecord);
}

/**
 * The invitation with this id in this household, whatever its status, or
 * null. One belonging to another household is null too, so a caller cannot
 * tell it apart from an id that does not exist.
 */
export async function findInHousehold(
  householdId: string,
  invitationId: string
): Promise<InvitationRecord | null> {
  const row = await getPrisma().invitation.findFirst({
    where: { id: invitationId, householdId },
  });

  return row ? toInvitationRecord(row) : null;
}

/**
 * Revoke a pending, unexpired invitation (UC-14 step 5). A conditional update,
 * like `acceptIntoHousehold`'s claim, so a link accepted or expiring at the
 * same moment is never also revoked: returns false when nothing changed.
 */
export async function revokePending(invitationId: string): Promise<boolean> {
  const revoked = await getPrisma().invitation.updateMany({
    where: { id: invitationId, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "REVOKED" },
  });

  return revoked.count === 1;
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
 * Claim the invitation and add the user to its household as a MEMBER, in one
 * transaction (UC-04 steps 10-11).
 *
 * The claim is a conditional update — only a PENDING, unexpired invitation
 * changes — so two people accepting the same link at once cannot both get in:
 * the second update matches nothing, and this returns false. It also means a
 * membership is never created without its invitation being marked ACCEPTED,
 * or the other way round.
 *
 * Throws `UniqueConstraintError` when the user is already a member of this
 * household, having joined between the caller's check and this write.
 */
export async function acceptIntoHousehold(accept: {
  invitationId: string;
  userId: string;
  householdId: string;
}): Promise<boolean> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: {
          id: accept.invitationId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        data: { status: "ACCEPTED" },
      });

      if (claimed.count === 0) {
        return false;
      }

      await tx.membership.create({
        data: {
          userId: accept.userId,
          householdId: accept.householdId,
          role: "MEMBER",
        },
      });

      return true;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new UniqueConstraintError("membership");
    }
    throw error;
  }
}
