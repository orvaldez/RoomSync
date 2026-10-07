import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  rateLimit,
  type AugmentedRequest,
  type Options,
} from "express-rate-limit";
import { RateLimitedError } from "../services/errors";
import { normalizeEmail } from "../services/validation";

/**
 * Rate limits on login and registration (#71, docs/security/rate-limiting.md).
 *
 * Without them, passwords can be guessed as fast as bcrypt allows, and the
 * registration endpoint's 409 can be used to check which emails have
 * accounts at any speed.
 *
 * - Login is limited per account email and per IP, counting only wrong
 *   passwords (401), so a correct password never uses up the allowance, and
 *   requests already refused (429) don't either: a burst against one account
 *   doesn't lock out everyone else on the same network. The email limit
 *   stops a guessing run against one account from many addresses; the IP
 *   limit stops one address spraying guesses across many accounts.
 * - Registration is limited per IP, counting every attempt.
 *
 * Counters live in memory, which is correct for the single server process
 * RoomSync runs. Behind a load balancer with several instances each would
 * count separately; the Milestone 3 deployment needs a shared store then.
 */

export interface RateLimitConfig {
  windowMinutes: number;
  loginMaxFailuresPerEmail: number;
  loginMaxFailuresPerIp: number;
  registerMaxPerIp: number;
}

export const RATE_LIMIT_DEFAULTS: RateLimitConfig = {
  windowMinutes: 15,
  loginMaxFailuresPerEmail: 5,
  loginMaxFailuresPerIp: 20,
  registerMaxPerIp: 10,
};

const ENV_NAMES: Record<keyof RateLimitConfig, string> = {
  windowMinutes: "RATE_LIMIT_WINDOW_MINUTES",
  loginMaxFailuresPerEmail: "LOGIN_MAX_FAILURES_PER_EMAIL",
  loginMaxFailuresPerIp: "LOGIN_MAX_FAILURES_PER_IP",
  registerMaxPerIp: "REGISTER_MAX_PER_IP",
};

/**
 * Reads the limits from the environment, falling back to the defaults. A value
 * that isn't a positive whole number stops the server at startup, like a
 * missing SESSION_SECRET, rather than silently running without a limit.
 */
export function rateLimitConfig(
  env: NodeJS.ProcessEnv = process.env
): RateLimitConfig {
  const config = { ...RATE_LIMIT_DEFAULTS };

  for (const key of Object.keys(ENV_NAMES) as (keyof RateLimitConfig)[]) {
    const raw = env[ENV_NAMES[key]];
    if (raw === undefined || raw.trim() === "") {
      continue;
    }

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        `${ENV_NAMES[key]} must be a positive whole number, got "${raw}".`
      );
    }
    config[key] = value;
  }

  return config;
}

/** "1 minute", "15 minutes": rounded up, so the user never retries too early. */
function minutes(seconds: number): string {
  const n = Math.max(1, Math.ceil(seconds / 60));
  return n === 1 ? "1 minute" : `${n} minutes`;
}

/**
 * Hands a refused request to the error middleware as RATE_LIMITED, so it
 * leaves in the contract's `{ error: { code, message } }` shape, with
 * `Retry-After` in seconds until the window resets.
 */
function refuseWith(message: (wait: string) => string): Options["handler"] {
  return (req: Request, res: Response, next: NextFunction) => {
    const resetTime = (req as AugmentedRequest).rateLimit?.resetTime;
    const seconds = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : 60;

    res.setHeader("Retry-After", String(seconds));
    next(new RateLimitedError(message(minutes(seconds)), seconds));
  };
}

/** Only a wrong password counts against a login allowance. */
const countWrongPasswordsOnly = {
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req: Request, res: Response) => res.statusCode !== 401,
};

const loginRefused = refuseWith(
  (wait) => `Too many failed login attempts. Try again in ${wait}.`
);

function requestEmail(req: Request): string | undefined {
  const email: unknown = req.body?.email;
  return typeof email === "string" && email.trim() !== ""
    ? normalizeEmail(email)
    : undefined;
}

export interface AuthRateLimits {
  login: RequestHandler[];
  register: RequestHandler;
}

export function buildAuthRateLimits(
  config: RateLimitConfig = rateLimitConfig()
): AuthRateLimits {
  const windowMs = config.windowMinutes * 60 * 1000;
  const shared = {
    windowMs,
    // RateLimit-* headers tell a client its remaining allowance (IETF draft 8).
    standardHeaders: "draft-8",
    legacyHeaders: false,
  } as const;

  const loginPerEmail = rateLimit({
    ...shared,
    limit: config.loginMaxFailuresPerEmail,
    identifier: "login-email",
    ...countWrongPasswordsOnly,
    // Same normalization as the login itself, so case and spaces don't give
    // an attacker a fresh allowance for the same account.
    keyGenerator: (req) => requestEmail(req) ?? "",
    // No email means a 400 from validation, which needs no limit.
    skip: (req) => requestEmail(req) === undefined,
    handler: loginRefused,
  });

  const loginPerIp = rateLimit({
    ...shared,
    limit: config.loginMaxFailuresPerIp,
    identifier: "login-ip",
    ...countWrongPasswordsOnly,
    handler: loginRefused,
  });

  const register = rateLimit({
    ...shared,
    limit: config.registerMaxPerIp,
    identifier: "register-ip",
    handler: refuseWith(
      (wait) => `Too many sign-ups from this network. Try again in ${wait}.`
    ),
  });

  return { login: [loginPerIp, loginPerEmail], register };
}
