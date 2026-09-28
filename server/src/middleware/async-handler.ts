import type { NextFunction, Request, Response } from "express";

/**
 * Express 4 does not catch rejections from an async handler: the promise
 * rejects, `next` is never called, and the request hangs until it times out.
 * Wrapping a handler forwards the rejection to the error middleware.
 *
 * Express 5 does this itself, which is one of the things to drop when the
 * upgrade is revisited at Milestone 2 (see docs/security/dependency-audit.md).
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
