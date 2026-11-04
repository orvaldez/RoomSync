import { createHmac } from "node:crypto";
import type { Request } from "express";
import type { AppError } from "../services/errors";
import { normalizeEmail } from "../services/validation";

/**
 * Security events, one JSON line each on stdout, where the host collects them
 * (#99; OWASP A09:2025, docs/security/owasp-review.md).
 *
 * Logged: a failed login, a rate limit reached, any 403, and a household 404
 * for a signed-in user. Those are the traces a password-guessing run or a
 * member probing other households' ids leaves. They are logged from the error
 * handler, which every one of them already passes through, so no service
 * knows about logging.
 *
 * Never logged: passwords, session ids, cookies, request bodies, query
 * strings, or invitation tokens. The account a login was for is recorded only
 * as an HMAC of its email, keyed with SESSION_SECRET: the same account gives
 * the same value, so repeated attempts show up together, but the address
 * can't be read back from the log.
 */

export type SecurityEvent =
  | "login_failed"
  | "rate_limited"
  | "forbidden"
  | "household_not_found";

export type SecurityLogLine = {
  time: string;
  level: "warn";
  category: "security";
  event: SecurityEvent;
  code: string;
  status: number;
  method: string;
  route: string;
  ip: string | undefined;
  /** The signed-in member, when there is one. An id, not a name or email. */
  userId?: string;
  /** HMAC of the normalized email a login or registration was for. */
  account?: string;
};

/** Which errors are security events, and under what name. */
function eventFor(error: AppError, signedIn: boolean): SecurityEvent | null {
  if (error.code === "INVALID_CREDENTIALS") return "login_failed";
  if (error.code === "RATE_LIMITED") return "rate_limited";
  if (error.status === 403) return "forbidden";
  if (error.code === "HOUSEHOLD_NOT_FOUND" && signedIn) return "household_not_found";
  return null;
}

/**
 * Logging is on by default and off under the test runners, so test output
 * stays readable. SECURITY_LOG=on or SECURITY_LOG=off overrides either way.
 */
export function securityLogEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SECURITY_LOG === "on") return true;
  if (env.SECURITY_LOG === "off") return false;
  return env.NODE_ENV !== "test" && env.NODE_ENV !== "integration";
}

/**
 * The route as declared (`/api/invitations/:token/accept`), not as requested,
 * so a token in the path never reaches the log. Before a route has matched,
 * the path with any invitation token replaced.
 */
function routeOf(req: Request): string {
  const requested = (req.originalUrl ?? req.path).split("?")[0];
  const declared = req.route?.path;
  if (typeof declared === "string") {
    // By the error handler, Express has reset `baseUrl`, so the router's mount
    // point (`/api`) is the part of the requested path before the declared
    // route's own segments.
    const segments = requested.split("/").filter(Boolean);
    const own = declared.split("/").filter(Boolean).length;
    const mount = segments.slice(0, Math.max(0, segments.length - own));
    return `${mount.length ? `/${mount.join("/")}` : ""}${declared}`;
  }
  return requested.replace(/\/invitations\/[^/]+/, "/invitations/:token");
}

function accountOf(req: Request): string | undefined {
  const email: unknown = req.body?.email;
  if (typeof email !== "string" || email.trim() === "") return undefined;
  const key = process.env.SESSION_SECRET ?? "";
  return createHmac("sha256", key).update(normalizeEmail(email)).digest("hex").slice(0, 16);
}

/** The log line for `error`, or null if it isn't a security event. */
export function securityLogLine(
  error: AppError,
  req: Request,
  now: Date = new Date()
): SecurityLogLine | null {
  const userId = req.session?.userId;
  const event = eventFor(error, Boolean(userId));
  if (!event) return null;

  const line: SecurityLogLine = {
    time: now.toISOString(),
    level: "warn",
    category: "security",
    event,
    code: error.code,
    status: error.status,
    method: req.method,
    route: routeOf(req),
    ip: req.ip,
  };
  if (userId) line.userId = userId;
  if (event === "login_failed" || event === "rate_limited") {
    const account = accountOf(req);
    if (account) line.account = account;
  }
  return line;
}

/** Writes `error` as a security event, if it is one and logging is on. */
export function logSecurityEvent(
  error: AppError,
  req: Request,
  write: (text: string) => void = (text) => process.stdout.write(text)
): void {
  if (!securityLogEnabled()) return;
  const line = securityLogLine(error, req);
  if (line) write(`${JSON.stringify(line)}\n`);
}
