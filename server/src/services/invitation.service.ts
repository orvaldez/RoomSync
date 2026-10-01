import { randomBytes } from "node:crypto";
import * as householdRepository from "../repositories/household.repository";
import * as invitationRepository from "../repositories/invitation.repository";
import { UniqueConstraintError } from "../repositories/errors";
import {
  AlreadyInHouseholdError,
  InvitationExpiredError,
  InvitationInvalidError,
  NotHouseholdOwnerError,
} from "./errors";
import type { PublicHousehold } from "./household.service";

/**
 * Inviting a roommate and joining a household by invitation, per UC-04.
 *
 * RoomSync does not send email in the MVP (UC-04 step 4): the owner gets a
 * link containing the token and sends it through their own messaging.
 */

/** Contract decision 1: long enough to act on, short enough that a leaked link does not stay live all semester. */
export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** The contract's `InvitationPublic` (Section 2). */
export type PublicInvitation = {
  id: string;
  token: string;
  status: invitationRepository.InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
};

/**
 * What the recipient sees before accepting (UC-04 step 8). Only the household
 * name — not its members or anything else — since the link may have been
 * forwarded to someone it was not meant for.
 */
export type InvitationPreview = {
  householdName: string;
  expiresAt: Date;
};

/**
 * Create an invitation to the household (UC-04 steps 1-3). OWNER only (1a).
 *
 * `role` is the requester's role as `requireHouseholdMember` verified it, so
 * membership is already established; this adds the owner check on top.
 */
export async function createInvitation(
  householdId: string,
  role: householdRepository.MembershipRole
): Promise<PublicInvitation> {
  if (role !== "OWNER") {
    throw new NotHouseholdOwnerError();
  }

  // 32 bytes from a cryptographically secure source (UC-04 special
  // requirement): a guessable token would let an outsider join a household
  // and read its finances.
  const token = randomBytes(32).toString("base64url");

  const invitation = await invitationRepository.create({
    householdId,
    token,
    expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
  });

  return {
    id: invitation.id,
    token: invitation.token,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}

/** The household name for the confirmation screen, if the invitation is usable. */
export async function previewInvitation(token: unknown): Promise<InvitationPreview> {
  const invitation = await findByToken(token);
  await assertUsable(invitation);

  return {
    householdName: invitation.household.name,
    expiresAt: invitation.expiresAt,
  };
}

/**
 * Join the invitation's household as a MEMBER (UC-04 steps 9-11).
 *
 * The known limitation from household creation (#39) applies here too: the
 * one-household check and the join are not one atomic step, so two different
 * invitations accepted by the same user at the same instant could both
 * succeed. The single-invitation race is closed — see `acceptIntoHousehold`.
 */
export async function acceptInvitation(
  userId: string,
  token: unknown
): Promise<PublicHousehold> {
  const invitation = await findByToken(token);

  // UC-04 9b: already a member of this household — no change, and success
  // even if the invitation was since used, so a double-clicked Join does not
  // show the second click an error.
  const existingRole = await householdRepository.findRole(
    userId,
    invitation.householdId
  );
  if (existingRole) {
    return toPublicHousehold(invitation, existingRole);
  }

  await assertUsable(invitation);

  // UC-04 9a: one household per user in the MVP.
  if (await householdRepository.hasMembership(userId)) {
    throw new AlreadyInHouseholdError();
  }

  let joined: boolean;
  try {
    joined = await invitationRepository.acceptIntoHousehold({
      invitationId: invitation.id,
      userId,
      householdId: invitation.householdId,
    });
  } catch (error) {
    // They joined this household between the check above and the write —
    // the same outcome as 9b.
    if (error instanceof UniqueConstraintError) {
      return toPublicHousehold(invitation, "MEMBER");
    }
    throw error;
  }

  // Someone else accepted it, or it expired, since we looked.
  if (!joined) {
    throw new InvitationInvalidError();
  }

  return toPublicHousehold(invitation, "MEMBER");
}

async function findByToken(
  token: unknown
): Promise<invitationRepository.InvitationWithHousehold> {
  if (typeof token !== "string" || token.length === 0) {
    throw new InvitationInvalidError();
  }

  const invitation = await invitationRepository.findByToken(token);

  if (!invitation) {
    throw new InvitationInvalidError();
  }

  return invitation;
}

/**
 * Throws unless the invitation can still be accepted (UC-04 step 6).
 *
 * ACCEPTED and REVOKED answer exactly like a token that never existed (6a,
 * 6c). A pending invitation past its expiry is marked EXPIRED as it is found
 * (6b), so the stored status catches up with the clock.
 */
async function assertUsable(
  invitation: invitationRepository.InvitationWithHousehold
): Promise<void> {
  if (invitation.status === "EXPIRED") {
    throw new InvitationExpiredError();
  }

  if (invitation.status !== "PENDING") {
    throw new InvitationInvalidError();
  }

  if (invitation.expiresAt.getTime() <= Date.now()) {
    await invitationRepository.markExpired(invitation.id);
    throw new InvitationExpiredError();
  }
}

function toPublicHousehold(
  invitation: invitationRepository.InvitationWithHousehold,
  role: householdRepository.MembershipRole
): PublicHousehold {
  return {
    id: invitation.household.id,
    name: invitation.household.name,
    createdAt: invitation.household.createdAt,
    role,
  };
}
