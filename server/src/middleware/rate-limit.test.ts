import { describe, it, expect } from "vitest";
import { RATE_LIMIT_DEFAULTS, rateLimitConfig } from "./rate-limit";

describe("rateLimitConfig", () => {
  it("uses the defaults when nothing is set", () => {
    expect(rateLimitConfig({})).toEqual(RATE_LIMIT_DEFAULTS);
  });

  it("reads each limit from its environment variable", () => {
    expect(
      rateLimitConfig({
        RATE_LIMIT_WINDOW_MINUTES: "30",
        LOGIN_MAX_FAILURES_PER_EMAIL: "3",
        LOGIN_MAX_FAILURES_PER_IP: "50",
        REGISTER_MAX_PER_IP: "4",
      })
    ).toEqual({
      windowMinutes: 30,
      loginMaxFailuresPerEmail: 3,
      loginMaxFailuresPerIp: 50,
      registerMaxPerIp: 4,
    });
  });

  it("treats an empty value as unset", () => {
    expect(rateLimitConfig({ LOGIN_MAX_FAILURES_PER_EMAIL: " " })).toEqual(
      RATE_LIMIT_DEFAULTS
    );
  });

  it.each(["0", "-5", "2.5", "five"])(
    "refuses %j rather than running without a limit",
    (value) => {
      expect(() => rateLimitConfig({ LOGIN_MAX_FAILURES_PER_EMAIL: value })).toThrow(
        "LOGIN_MAX_FAILURES_PER_EMAIL must be a positive whole number"
      );
    }
  );
});
