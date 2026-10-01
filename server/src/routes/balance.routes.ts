import { Router, type Request, type Response } from "express";
import * as balanceService from "../services/balance.service";
import * as settlementService from "../services/settlement.service";
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
 * 404 HOUSEHOLD_NOT_FOUND   no such household, or not a member of it    UC-07 1a
 */

/**
 * GET /api/households/:householdId/balances — UC-07.
 *
 * 200 { balances: BalancePublic[], totals: { youOweCents, owedToYouCents } }
 *     one balance per other member, zeros included; positive netCents means
 *     that member owes the requester
 */
router.get(
  "/households/:householdId/balances",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const summary = await balanceService.getBalances(householdId, currentUserId(req));

    res.status(200).json(summary);
  })
);

/**
 * POST /api/households/:householdId/settlements — UC-08.
 *
 * 201 { settlement: SettlementPublic }
 * 400 VALIDATION_FAILED        amountCents or note invalid             UC-08 4b
 * 400 SAME_MEMBER                                                      UC-08 4c
 * 400 MEMBER_NOT_IN_HOUSEHOLD                                          UC-08 4d
 * 409 EXCEEDS_BALANCE          more than from owes to, right now       UC-08 4a, 4e
 */
router.post(
  "/households/:householdId/settlements",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const body = req.body ?? {};
    const settlement = await settlementService.createSettlement(householdId, {
      fromUserId: body.fromUserId,
      toUserId: body.toUserId,
      amountCents: body.amountCents,
      note: body.note,
    });

    res.status(201).json({ settlement });
  })
);

/**
 * GET /api/households/:householdId/settlements
 *
 * 200 { settlements: SettlementPublic[] }   newest settledAt first
 */
router.get(
  "/households/:householdId/settlements",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (_req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const settlements = await settlementService.listSettlements(householdId);

    res.status(200).json({ settlements });
  })
);

export default router;
