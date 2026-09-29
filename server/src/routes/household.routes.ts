import { Router, type Request, type Response } from "express";
import * as householdService from "../services/household.service";
import { asyncHandler } from "../middleware/async-handler";
import { currentUserId, requireAuth } from "../middleware/require-auth";
import {
  currentMembership,
  requireHouseholdMember,
} from "../middleware/require-household-member";

const router = Router();

/**
 * POST /api/households — UC-03, API contract Section 4.
 *
 * 201 { household: { id, name, createdAt, role } }   role is "OWNER"
 * 400 VALIDATION_FAILED     name empty, whitespace, or over 100 chars   UC-03 3a
 * 409 ALREADY_IN_HOUSEHOLD  the requester already belongs to one        UC-03 1a
 * 401 UNAUTHENTICATED       no session
 *
 * Errors are not shaped here. The service throws an AppError carrying its own
 * code and status, and the error middleware renders it.
 */
router.post(
  "/households",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const household = await householdService.createHousehold({
      userId: currentUserId(req),
      name: req.body?.name,
    });

    res.status(201).json({ household });
  })
);

/**
 * GET /api/households/current — the requester's household, or null.
 *
 * 200 { household } or 200 { household: null }
 * 401 UNAUTHENTICATED
 *
 * Belonging to no household is a normal state, not an error: the client uses
 * the null to show the create-or-join screen (UC-02 6a, UC-10 2a).
 *
 * Declared before any `/households/:householdId` route added later, or Express
 * would match "current" as an id.
 */
router.get(
  "/households/current",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const household = await householdService.getCurrentHousehold(
      currentUserId(req)
    );

    res.status(200).json({ household });
  })
);

/**
 * GET /api/households/:householdId/members — contract Section 4.
 *
 * 200 { members: MemberPublic[] }   ordered by joinedAt
 * 404 HOUSEHOLD_NOT_FOUND           no such household, or not a member of it
 * 401 UNAUTHENTICATED               no session
 */
router.get(
  "/households/:householdId/members",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (_req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const members = await householdService.listMembers(householdId);

    res.status(200).json({ members });
  })
);

export default router;
