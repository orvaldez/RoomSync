import type { NextFunction, Request, Response } from "express";
import { UnauthenticatedError } from "../services/errors";

/**
 * Guards every endpoint the contract marks **Auth: required**.
 *
 * Rejects with `401 UNAUTHENTICATED` when there is no session, including on
 * direct API calls rather than only page navigation (FR-03, UC-02 extension
 * 9a). Hiding a link in the client is not access control.
 *
 * On success, `req.session.userId` is guaranteed present, so downstream
 * handlers can read it without re-checking.
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.session?.userId) {
    next(new UnauthenticatedError());
    return;
  }

  next();
}

/**
 * Reads the authenticated user's id. Only call this behind `requireAuth`;
 * the throw is a programming-error guard, not a request-validation path.
 */
export function currentUserId(req: Request): string {
  const userId = req.session?.userId;

  if (!userId) {
    throw new Error(
      "currentUserId called on an unauthenticated request. Mount requireAuth on this route."
    );
  }

  return userId;
}
