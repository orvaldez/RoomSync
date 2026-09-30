import { Router, type Request, type Response } from "express";
import * as invitationService from "../services/invitation.service";
import { asyncHandler } from "../middleware/async-handler";
import { currentUserId, requireAuth } from "../middleware/require-auth";
import {
  currentMembership,
  requireHouseholdMember,
} from "../middleware/require-household-member";

const router = Router();

/**
 * POST /api/households/:householdId/invitations — UC-04 steps 1-3.
 *
 * 201 { invitation: InvitationPublic }
 * 403 NOT_HOUSEHOLD_OWNER   a member, but not the owner              UC-04 1a
 * 404 HOUSEHOLD_NOT_FOUND   no such household, or not a member of it
 * 401 UNAUTHENTICATED       no session
 */
router.post(
  "/households/:householdId/invitations",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (_req: Request, res: Response) => {
    const { householdId, role } = currentMembership(res);
    const invitation = await invitationService.createInvitation(householdId, role);

    res.status(201).json({ invitation });
  })
);

/**
 * GET /api/invitations/:token — the confirmation screen, UC-04 step 8.
 *
 * 200 { invitation: { householdName, expiresAt } }
 * 404 INVITATION_INVALID    never existed, already used, or revoked  UC-04 6a, 6c
 * 410 INVITATION_EXPIRED                                             UC-04 6b
 * 401 UNAUTHENTICATED       the client sends the visitor to log in, then back
 */
router.get(
  "/invitations/:token",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const invitation = await invitationService.previewInvitation(req.params.token);

    res.status(200).json({ invitation });
  })
);

/**
 * POST /api/invitations/:token/accept — UC-04 steps 9-11.
 *
 * 200 { household: HouseholdPublic }   role is "MEMBER", or the requester's
 *                                      existing role if already a member (9b)
 * 404 INVITATION_INVALID
 * 410 INVITATION_EXPIRED
 * 409 ALREADY_IN_HOUSEHOLD  belongs to a different household           UC-04 9a
 * 401 UNAUTHENTICATED
 */
router.post(
  "/invitations/:token/accept",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const household = await invitationService.acceptInvitation(
      currentUserId(req),
      req.params.token
    );

    res.status(200).json({ household });
  })
);

export default router;
