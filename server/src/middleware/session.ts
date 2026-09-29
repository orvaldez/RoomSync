import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { RequestHandler } from "express";

/**
 * Session configuration, per the API contract's Conventions section:
 * an `httpOnly`, `SameSite=Lax` cookie set by `POST /api/auth/login`.
 *
 * Sessions live in PostgreSQL rather than in memory. The default
 * `MemoryStore` loses every session when the process restarts — which
 * `tsx watch` does on every file save — and it does not survive the multiple
 * instances a deployment may run at Milestone 3.
 */

/** Two weeks. Long enough that a roommate is not logged out mid-lease. */
const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Whether the session cookie is restricted to HTTPS, and whether Express
 * should believe the proxy's `X-Forwarded-Proto` header.
 *
 * These two must agree. Render terminates TLS at its proxy and forwards plain
 * HTTP, so `req.secure` is false even though the browser connected over
 * HTTPS. With `secure: true` and no `trust proxy`, express-session decides the
 * connection is insecure, silently refuses to set the cookie, and every login
 * in production appears to succeed while leaving the user logged out.
 *
 * Exported as a pair so the coupling is visible and testable, rather than two
 * unrelated `NODE_ENV` checks in different files that someone can change one
 * of.
 */
export function isBehindTlsProxy(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "production";
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export function buildSessionMiddleware(): RequestHandler {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Copy server/.env.example to server/.env."
    );
  }

  if (process.env.NODE_ENV === "production" && secret.includes("change-me")) {
    throw new Error(
      "SESSION_SECRET is still the example value. Set a real secret before deploying."
    );
  }

  return session({
    name: "roomsync.sid",
    secret,
    store: buildStore(),
    // Don't rewrite an unchanged session on every request.
    resave: false,
    // Don't persist a session for a visitor who never logged in; otherwise
    // every anonymous request writes a row.
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // not readable from JavaScript, so XSS cannot steal it
      sameSite: "lax", // blocks the cookie on cross-site POSTs (CSRF)
      // Paired with `trust proxy` in app.ts — see isBehindTlsProxy.
      secure: isBehindTlsProxy(),
      maxAge: SESSION_MAX_AGE_MS,
    },
  });
}

function buildStore(): session.Store | undefined {
  // Tests run without a database. `undefined` leaves express-session on its
  // default MemoryStore, which is correct for a test process and wrong
  // everywhere else.
  if (process.env.NODE_ENV === "test") {
    return undefined;
  }

  const PgStore = connectPgSimple(session);

  return new PgStore({
    conString: process.env.DATABASE_URL,
    tableName: "session",
    // Prisma owns this table via the Session model in schema.prisma. If the
    // store created it, `prisma migrate dev` would see drift and offer to
    // drop it.
    createTableIfMissing: false,
    // Sweep expired rows hourly. Without this, logged-out and stale sessions
    // accumulate forever.
    pruneSessionInterval: 60 * 60,
  });
}
