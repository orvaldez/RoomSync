import { Router, type Request, type Response } from "express";
import * as authService from "../services/auth.service";
import { EmailTakenError, ValidationError } from "../services/errors";

const router = Router();

/**
 * POST /api/auth/register — UC-01.
 *
 * 201 { user: { id, name, email, createdAt } }
 * 400 { error: { message, fields } }   invalid input
 * 409 { error: { message } }           email already registered
 * 500 { error: { message } }           unexpected
 *
 * Endpoint shape is provisional until #3 (API contract v1) lands. If that
 * contract settles on a different envelope, this route changes and the
 * service below it does not.
 */
router.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const user = await authService.register({
      name: req.body?.name,
      email: req.body?.email,
      password: req.body?.password,
    });

    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: { message: error.message, fields: error.fields },
      });
      return;
    }

    if (error instanceof EmailTakenError) {
      res.status(409).json({ error: { message: error.message } });
      return;
    }

    // Never surface the underlying error: a database message can disclose
    // schema details. Log it for the developer, return something generic.
    console.error("POST /api/auth/register failed:", error);
    res.status(500).json({
      error: { message: "Something went wrong. Please try again." },
    });
  }
});

export default router;
