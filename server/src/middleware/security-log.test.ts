import { describe, it, expect } from "vitest";
import type { Request } from "express";

import {
  HouseholdNotFoundError,
  InvalidCredentialsError,
  NotHouseholdOwnerError,
  RateLimitedError,
  ValidationError,
} from "../services/errors";
import { securityLogEnabled, securityLogLine } from "./security-log";

/**
 * #99: security events are logged as JSON lines, and never carry a password,
 * an email, a cookie, a session id or an invitation token.
 */
const PASSWORD = "correct-horse-battery";
const USER = { id: "clxUSER00000000000000000" };

/** A minimal stand-in for Express's request, for the pure function. */
function fakeRequest(overrides: Partial<Request> & { userId?: string } = {}): Request {
  const { userId, ...rest } = overrides;
  return {
    method: "POST",
    baseUrl: "",
    route: { path: "/auth/login" },
    originalUrl: "/api/auth/login",
    path: "/api/auth/login",
    ip: "203.0.113.7",
    body: {},
    session: userId ? { userId } : {},
    ...rest,
  } as unknown as Request;
}

describe("securityLogEnabled", () => {
  it("is off under the test runners, so test output stays readable", () => {
    expect(securityLogEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(securityLogEnabled({ NODE_ENV: "integration" })).toBe(false);
  });

  it("is on in development and production", () => {
    expect(securityLogEnabled({})).toBe(true);
    expect(securityLogEnabled({ NODE_ENV: "production" })).toBe(true);
  });

  it("can be forced either way with SECURITY_LOG", () => {
    expect(securityLogEnabled({ NODE_ENV: "test", SECURITY_LOG: "on" })).toBe(true);
    expect(securityLogEnabled({ NODE_ENV: "production", SECURITY_LOG: "off" })).toBe(false);
  });

  it("reads SECURITY_LOG in any capitalization, with spaces ignored", () => {
    expect(securityLogEnabled({ NODE_ENV: "test", SECURITY_LOG: "On" })).toBe(true);
    expect(securityLogEnabled({ NODE_ENV: "test", SECURITY_LOG: " ON " })).toBe(true);
    expect(securityLogEnabled({ NODE_ENV: "production", SECURITY_LOG: "OFF" })).toBe(false);
    expect(securityLogEnabled({ NODE_ENV: "production", SECURITY_LOG: "Off" })).toBe(false);
  });

  it("ignores any other SECURITY_LOG value and keeps the default", () => {
    expect(securityLogEnabled({ NODE_ENV: "production", SECURITY_LOG: "yes" })).toBe(true);
    expect(securityLogEnabled({ NODE_ENV: "test", SECURITY_LOG: "" })).toBe(false);
  });
});

describe("securityLogLine", () => {
  const NOW = new Date("2026-11-03T12:00:00.000Z");

  it("records a failed login with the account as an HMAC, never the email", () => {
    const req = fakeRequest({ body: { email: "Agustin@RoomSync.test", password: PASSWORD } });

    const line = securityLogLine(new InvalidCredentialsError(), req, NOW);

    expect(line).toMatchObject({
      time: "2026-11-03T12:00:00.000Z",
      level: "warn",
      category: "security",
      event: "login_failed",
      code: "INVALID_CREDENTIALS",
      status: 401,
      method: "POST",
      route: "/api/auth/login",
      ip: "203.0.113.7",
    });
    expect(line?.account).toMatch(/^[0-9a-f]{16}$/);
    const text = JSON.stringify(line);
    expect(text).not.toContain(PASSWORD);
    expect(text.toLowerCase()).not.toContain("agustin@roomsync.test");
  });

  it("gives the same account value for the same email however it's typed", () => {
    const a = securityLogLine(new InvalidCredentialsError(), fakeRequest({ body: { email: "agustin@roomsync.test" } }));
    const b = securityLogLine(new InvalidCredentialsError(), fakeRequest({ body: { email: "  AGUSTIN@roomsync.test " } }));
    expect(a?.account).toBe(b?.account);
  });

  it("records a rate limit reached", () => {
    const line = securityLogLine(new RateLimitedError("Too many failed login attempts.", 60), fakeRequest());
    expect(line).toMatchObject({ event: "rate_limited", code: "RATE_LIMITED", status: 429 });
  });

  it("records any 403, with the signed-in member's id", () => {
    const req = fakeRequest({
      route: { path: "/households/:householdId/invitations" } as Request["route"],
      originalUrl: "/api/households/clxH000000000000000000000/invitations?x=1",
      userId: USER.id,
    });

    const line = securityLogLine(new NotHouseholdOwnerError(), req);

    expect(line).toMatchObject({
      event: "forbidden",
      code: "NOT_HOUSEHOLD_OWNER",
      status: 403,
      route: "/api/households/:householdId/invitations",
      userId: USER.id,
    });
    expect(line).not.toHaveProperty("account");
  });

  it("records a household 404 only for a signed-in member", () => {
    expect(securityLogLine(new HouseholdNotFoundError(), fakeRequest({ userId: USER.id }))).toMatchObject({
      event: "household_not_found",
    });
    expect(securityLogLine(new HouseholdNotFoundError(), fakeRequest())).toBeNull();
  });

  it("ignores errors that aren't security events", () => {
    expect(securityLogLine(new ValidationError({ email: "Required." }), fakeRequest())).toBeNull();
  });

  it("logs the declared route, so an invitation token in the path never appears", () => {
    const token = "a".repeat(43);
    const matched = fakeRequest({
      route: { path: "/invitations/:token/accept" } as Request["route"],
      originalUrl: `/api/invitations/${token}/accept`,
      userId: USER.id,
    });
    const unmatched = fakeRequest({
      route: undefined,
      originalUrl: `/api/invitations/${token}/accept?ref=${token}`,
      userId: USER.id,
    });

    for (const req of [matched, unmatched]) {
      const line = securityLogLine(new NotHouseholdOwnerError(), req);
      expect(line?.route).toContain("/invitations/:token");
      expect(JSON.stringify(line)).not.toContain(token);
    }
  });
});
