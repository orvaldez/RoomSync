import { Router, type Request, type Response } from "express";
import * as choreService from "../services/chore.service";
import { asyncHandler } from "../middleware/async-handler";
import { currentUserId, requireAuth } from "../middleware/require-auth";
import {
  currentMembership,
  requireHouseholdMember,
} from "../middleware/require-household-member";

const router = Router();

/**
 * Errors every route below can return, in addition to its own:
 *
 * 401 UNAUTHENTICATED       no session
 * 404 HOUSEHOLD_NOT_FOUND   no such household, or not a member of it
 */

/** Everything a chore body may carry; anything else in it is ignored. */
function choreBody(req: Request): choreService.ChoreInput {
  const body = req.body ?? {};
  return {
    title: body.title,
    description: body.description,
    assignedUserId: body.assignedUserId,
    dueDate: body.dueDate,
  };
}

/**
 * POST /api/households/:householdId/chores — UC-09 steps 1-6.
 *
 * 201 { chore: ChorePublic }
 * 400 VALIDATION_FAILED     title, description or dueDate invalid     UC-09 2a
 * 400 ASSIGNEE_NOT_MEMBER                                             UC-09 3a
 */
router.post(
  "/households/:householdId/chores",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const chore = await choreService.createChore(householdId, choreBody(req));

    res.status(201).json({ chore });
  })
);

/**
 * GET /api/households/:householdId/chores?status=open|completed
 *
 * 200 { chores: ChorePublic[] }
 * 400 VALIDATION_FAILED     status is something else
 */
router.get(
  "/households/:householdId/chores",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const chores = await choreService.listChores(householdId, req.query.status);

    res.status(200).json({ chores });
  })
);

/**
 * PATCH /api/households/:householdId/chores/:choreId
 *
 * 200 { chore: ChorePublic }
 * 400 VALIDATION_FAILED
 * 400 ASSIGNEE_NOT_MEMBER
 * 404 CHORE_NOT_FOUND
 * 409 CHORE_ALREADY_COMPLETE
 */
router.patch(
  "/households/:householdId/chores/:choreId",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const chore = await choreService.updateChore(
      householdId,
      req.params.choreId,
      choreBody(req)
    );

    res.status(200).json({ chore });
  })
);

/**
 * POST /api/households/:householdId/chores/:choreId/complete — UC-09 8-11.
 *
 * 200 { chore: ChorePublic }   also for an already-complete chore (8a)
 * 403 CHORE_NOT_ASSIGNED_TO_YOU                                        UC-09 9a
 * 404 CHORE_NOT_FOUND
 */
router.post(
  "/households/:householdId/chores/:choreId/complete",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const chore = await choreService.completeChore(
      householdId,
      req.params.choreId,
      currentUserId(req)
    );

    res.status(200).json({ chore });
  })
);

export default router;
