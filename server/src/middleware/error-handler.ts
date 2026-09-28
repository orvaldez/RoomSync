import type { NextFunction, Request, Response } from "express";
import { AppError } from "../services/errors";

/**
 * The single place that turns an error into an HTTP response body.
 *
 * Every error leaves the API in the shape the contract defines
 * (docs/design/api-contract.md, Section 1):
 *
 *     { "error": { "code": "...", "message": "..." } }
 *
 * VALIDATION_FAILED additionally carries a `fields` map. Routes never build
 * this shape themselves; they call `next(error)` and it arrives here.
 */

/** Express signals a malformed JSON body with a SyntaxError carrying `body`. */
function isJsonParseError(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    "body" in error &&
    (error as { status?: unknown }).status === 400
  );
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // Express requires the four-argument signature to treat this as an error
  // handler, and delegates to its own if headers are already sent.
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isJsonParseError(error)) {
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body is not valid JSON." },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, ...error.details() },
    });
    return;
  }

  // Anything else is a bug or an outage. Log it for the developer; return
  // nothing specific, since a database message can disclose schema details.
  console.error("Unhandled error:", error);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
    },
  });
}
