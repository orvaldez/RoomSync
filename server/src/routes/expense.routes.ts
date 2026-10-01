import { Router, type Request, type Response } from "express";
import * as expenseService from "../services/expense.service";
import { asyncHandler } from "../middleware/async-handler";
import { requireAuth } from "../middleware/require-auth";
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
 *
 * The household always comes from the URL, verified by the guard, never from
 * the body. Errors are not shaped here: the service throws an AppError and the
 * error middleware renders it.
 */

/** Everything the expense body may carry; anything else in it is ignored. */
function expenseBody(req: Request): expenseService.ExpenseInput {
  const body = req.body ?? {};
  return {
    description: body.description,
    totalAmountCents: body.totalAmountCents,
    expenseDate: body.expenseDate,
    paidByUserId: body.paidByUserId,
    splitMethod: body.splitMethod,
    participants: body.participants,
  };
}

/**
 * POST /api/households/:householdId/expenses/preview — UC-05 step 7.
 *
 * 200 { shares: SharePublic[] }
 * 400 the same codes as create. Writes nothing.
 */
router.post(
  "/households/:householdId/expenses/preview",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const shares = await expenseService.previewExpense(householdId, expenseBody(req));

    res.status(200).json({ shares });
  })
);

/**
 * POST /api/households/:householdId/expenses — UC-05, UC-06.
 *
 * 201 { expense: ExpensePublic }
 * 400 VALIDATION_FAILED        description, totalAmountCents, expenseDate,
 *                              splitMethod or participants invalid       UC-05 2a-2c
 * 400 NO_PARTICIPANTS                                                   UC-05 4a
 * 400 PAYER_NOT_MEMBER                                                  UC-05 3a
 * 400 PARTICIPANT_NOT_MEMBER
 * 400 DUPLICATE_PARTICIPANT
 * 400 SPLIT_SUM_MISMATCH                                                UC-06 C3a
 * 400 PERCENT_SUM_INVALID                                               UC-06 P3a
 */
router.post(
  "/households/:householdId/expenses",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const expense = await expenseService.createExpense(householdId, expenseBody(req));

    res.status(201).json({ expense });
  })
);

/**
 * GET /api/households/:householdId/expenses
 *
 * 200 { expenses: ExpensePublic[] }   newest expenseDate first, then newest createdAt
 */
router.get(
  "/households/:householdId/expenses",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (_req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const expenses = await expenseService.listExpenses(householdId);

    res.status(200).json({ expenses });
  })
);

/**
 * GET /api/households/:householdId/expenses/:expenseId
 *
 * 200 { expense: ExpensePublic }
 * 404 EXPENSE_NOT_FOUND   no such expense in this household
 */
router.get(
  "/households/:householdId/expenses/:expenseId",
  requireAuth,
  requireHouseholdMember,
  asyncHandler(async (req: Request, res: Response) => {
    const { householdId } = currentMembership(res);
    const expense = await expenseService.getExpense(householdId, req.params.expenseId);

    res.status(200).json({ expense });
  })
);

export default router;
