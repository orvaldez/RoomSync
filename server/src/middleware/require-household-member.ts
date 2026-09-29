import type { NextFunction, Request, Response } from "express";
import * as householdService from "../services/household.service";
import { asyncHandler } from "./async-handler";
import { currentUserId } from "./require-auth";

/**
 * Guards every endpoint the contract marks **Auth: required, member** — that
 * is, everything under `/api/households/:householdId`.
 *
 * Rejects with `404 HOUSEHOLD_NOT_FOUND` when the household does not exist or
 * the requester does not belong to it, so the API never confirms that someone
 * else's household exists (contract Section 1 and decision 5, NFR-07).
 *
 * Mount after `requireAuth`, on a route whose path has a `:householdId`:
 *
 *     router.get(
 *       "/households/:householdId/balances",
 *       requireAuth,
 *       requireHouseholdMember,
 *       asyncHandler(async (req, res) => { ... })
 *     );
 *
 * The decision itself lives in `householdService.requireMembership`, because
 * household authorization is a business rule (services/README.md). This file
 * only connects it to the request.
 */
export const requireHouseholdMember = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const householdId = req.params.householdId;

    if (!householdId) {
      throw new Error(
        "requireHouseholdMember mounted on a route without :householdId."
      );
    }

    const role = await householdService.requireMembership(
      currentUserId(req),
      householdId
    );

    const membership: HouseholdMembership = { householdId, role };
    res.locals.membership = membership;

    next();
  }
);

/** What `requireHouseholdMember` established about the requester. */
export type HouseholdMembership = {
  householdId: string;
  role: householdService.PublicMember["role"];
};

/**
 * Reads the household and role that `requireHouseholdMember` verified. Only
 * call this behind that guard; the throw is a programming-error guard, not a
 * request-validation path.
 */
export function currentMembership(res: Response): HouseholdMembership {
  const membership = res.locals.membership as HouseholdMembership | undefined;

  if (!membership) {
    throw new Error(
      "currentMembership called without a verified membership. Mount requireHouseholdMember on this route."
    );
  }

  return membership;
}
