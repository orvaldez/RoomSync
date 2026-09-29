import { describe, it, expect } from "vitest";
import { isBehindTlsProxy } from "./session";

/**
 * These guard a failure that no request-level test can catch: with
 * `secure: true` and no `trust proxy`, express-session refuses to set the
 * cookie behind a TLS-terminating proxy. Login then "succeeds" in production
 * while leaving every user logged out, and the tests stay green because
 * NODE_ENV=test takes the other branch.
 *
 * `app.ts` and `session.ts` both call this one function, so the secure-cookie
 * setting and the trust-proxy setting cannot drift apart.
 */
describe("isBehindTlsProxy", () => {
  it("is true in production, where a proxy terminates TLS", () => {
    expect(isBehindTlsProxy("production")).toBe(true);
  });

  it("is false in development, so a local client cannot spoof X-Forwarded-For", () => {
    expect(isBehindTlsProxy("development")).toBe(false);
  });

  it("is false in tests", () => {
    expect(isBehindTlsProxy("test")).toBe(false);
  });

  it("is false when NODE_ENV is unset", () => {
    // A bare `node dist/index.js` with no NODE_ENV must not claim to be
    // behind a proxy.
    expect(isBehindTlsProxy(undefined)).toBe(false);
  });
});
