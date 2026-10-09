import { Router, type Request, type Response } from "express";
import * as authService from "../services/auth.service";
import { asyncHandler } from "../middleware/async-handler";
import { currentUserId, requireAuth } from "../middleware/require-auth";
import { buildAuthRateLimits } from "../middleware/rate-limit";
import { UnauthenticatedError } from "../services/errors";

const router = Router();

// Limits read from the environment when the routes load (#71).
const rateLimits = buildAuthRateLimits();

/** Promise wrappers around express-session's callback API. */
function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

/**
 * POST /api/auth/register — UC-01, contract Section 4.
 *
 * 201 { user }
 * 400 VALIDATION_FAILED · 409 EMAIL_UNAVAILABLE · 429 RATE_LIMITED
 * 500 INTERNAL_ERROR
 *
 * Does not create a session: UC-01 step 7 sends the new user to log in.
 */
router.post(
  "/auth/register",
  rateLimits.register,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.register({
      name: req.body?.name,
      email: req.body?.email,
      password: req.body?.password,
    });

    res.status(201).json({ user });
  })
);

/**
 * POST /api/auth/login — UC-02 steps 1-6.
 *
 * 200 { user } and sets the session cookie
 * 400 VALIDATION_FAILED · 401 INVALID_CREDENTIALS · 429 RATE_LIMITED
 */
router.post(
  "/auth/login",
  ...rateLimits.login,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.login({
      email: req.body?.email,
      password: req.body?.password,
    });

    // Issue a fresh session id now that the caller is authenticated. Without
    // this, an id fixed before login (via a planted cookie) would carry on
    // into the authenticated session — session fixation.
    await regenerateSession(req);

    req.session.userId = user.id;

    // Write the session before responding, so a client that immediately
    // requests a protected route cannot beat the store to it.
    await saveSession(req);

    res.status(200).json({ user });
  })
);

/**
 * POST /api/auth/logout — UC-02 steps 7-9.
 *
 * 204, session destroyed and cookie cleared.
 */
router.post(
  "/auth/logout",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const cookieName = req.session.cookie ? "roomsync.sid" : undefined;

    await destroySession(req);

    // Destroying the server-side session is what ends it; clearing the cookie
    // keeps the browser from sending a now-dead id on every later request.
    if (cookieName) {
      res.clearCookie(cookieName);
    }

    res.status(204).end();
  })
);

/**
 * GET /api/auth/me — the client calls this on load to choose between the
 * login screen and the app.
 *
 * 200 { user } · 401 UNAUTHENTICATED
 */
router.get(
  "/auth/me",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.findCurrentUser(currentUserId(req));

    // The session points at a user that no longer exists — a deleted account
    // with a live cookie. Treat it as unauthenticated rather than 500.
    if (!user) {
      await destroySession(req);
      throw new UnauthenticatedError();
    }

    res.status(200).json({ user });
  })
);

export default router;
