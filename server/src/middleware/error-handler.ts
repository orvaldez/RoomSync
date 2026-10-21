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

/**
 * Errors the request parser raises for something the *client* got wrong: a
 * body over the size limit, an encoding or charset it can't read. They follow
 * the http-errors convention, a 4xx `status` with `expose: true`. Before
 * this they fell through to the 500 below and were logged as bugs (OWASP
 * A10:2025, docs/security/owasp-review.md).
 */
const CLIENT_ERRORS: Record<string, { code: string; message: string }> = {
  "entity.too.large": {
    code: "PAYLOAD_TOO_LARGE",
    message: "The request body is too large.",
  },
  "encoding.unsupported": {
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "The request body uses an encoding the server doesn't accept.",
  },
  "charset.unsupported": {
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "The request body uses a character set the server doesn't accept.",
  },
};

function asClientError(
  error: unknown
): { status: number; code: string; message: string } | null {
  if (typeof error !== "object" || error === null) return null;
  const { status, expose, type } = error as { status?: unknown; expose?: unknown; type?: unknown };
  if (expose !== true || typeof status !== "number" || status < 400 || status > 499) {
    return null;
  }
  const known = typeof type === "string" ? CLIENT_ERRORS[type] : undefined;
  return {
    status,
    ...(known ?? { code: "BAD_REQUEST", message: "The request could not be read." }),
  };
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

  const clientError = asClientError(error);
  if (clientError) {
    res.status(clientError.status).json({
      error: { code: clientError.code, message: clientError.message },
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
