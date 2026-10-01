import { Router, type Request, type Response } from "express";
import * as dashboardService from "../services/dashboard.service";
import { asyncHandler } from "../middleware/async-handler";
import { currentUserId, requireAuth } from "../middleware/require-auth";
import {
  currentMembership,
  requireHouseholdMember,
} from "../middleware/require-household-member";

const router = Router();

/**
 * GET /api/households/:householdId/dashboard — UC-10.
 *
 * 200 { household, members, balances, upcomingChores, recentActivity }
 *     upcomingChores: open chores assigned to the requester, soonest due first
 *     recentActivity: expenses, settlements and completed chores, newest
 *     first, at most 10
 * 401 UNAUTHENTICATED       no session                                  UC-10 1a
 * 404 HOUSEHOLD_NOT_FOUND   no such household, or not a member of it
 */
router.get(
  "/households/:householdId/dashboard",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const dashboard = await dashboardService.getDashboard(householdId, currentUserId(req));

    res.status(200).json(dashboard);
  })
);

export default router;
