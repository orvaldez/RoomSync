import { Router, type Request, type Response } from "express";
import * as authService from "../services/auth.service";
import { asyncHandler } from "../middleware/async-handler";

const router = Router();

/**
 * POST /api/auth/register — UC-01, API contract Section 4.
 *
 * 201 { user: { id, name, email, createdAt } }
 * 400 VALIDATION_FAILED   invalid input, with a per-field map
 * 409 EMAIL_UNAVAILABLE   email already registered
 * 500 INTERNAL_ERROR      unexpected
 *
 * Errors are not shaped here. The service throws an AppError carrying its own
 * code and status, and the error middleware renders it.
 */
router.post(
  "/auth/register",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.register({
      name: req.body?.name,
      email: req.body?.email,
      password: req.body?.password,
    });

    res.status(201).json({ user });
  })
);

export default router;
