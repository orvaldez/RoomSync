import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { isBehindTlsProxy, trustedProxyHops } from "./session";

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

describe("trustedProxyHops (#117)", () => {
  it("is 1 when TRUST_PROXY_HOPS is unset or blank, the value before #117", () => {
    expect(trustedProxyHops(undefined)).toBe(1);
    expect(trustedProxyHops("")).toBe(1);
    expect(trustedProxyHops("  ")).toBe(1);
  });

  it("reads a whole number of hops", () => {
    expect(trustedProxyHops("2")).toBe(2);
    expect(trustedProxyHops("5")).toBe(5);
  });

  it.each(["0", "-1", "6", "1.5", "two", "true", "2x"])(
    "refuses %j rather than guess, so a typo stops the deploy instead of misreading every IP",
    (raw) => {
      expect(() => trustedProxyHops(raw)).toThrow(/TRUST_PROXY_HOPS must be a whole number from 1 to 5/);
    }
  );
});

/**
 * What the number means, shown through Express itself. A visitor can always
 * send their own `X-Forwarded-For`; each proxy then appends the address it saw.
 * Here the "visitor" forges 203.0.113.7, the real visitor is 198.51.100.20,
 * and 10.0.0.5 is a proxy inside the host. Supertest's socket plays the last
 * proxy, the one connected to the server.
 */
describe("trust proxy hops, as Express applies them", () => {
  const FORGED = "203.0.113.7";
  const REAL = "198.51.100.20";
  const INNER_PROXY = "10.0.0.5";
  const chain = `${FORGED}, ${REAL}, ${INNER_PROXY}`;

  async function ipSeenWith(hops: number): Promise<string> {
    const app = express();
    app.set("trust proxy", hops);
    app.get("/ip", (req, res) => {
      res.json({ ip: req.ip });
    });
    const res = await request(app).get("/ip").set("X-Forwarded-For", chain);
    return res.body.ip;
  }

  it("too few hops: every visitor appears as the host's inner proxy", async () => {
    expect(await ipSeenWith(1)).toBe(INNER_PROXY);
  });

  it("the right number: the real visitor, and the forged entry is ignored", async () => {
    expect(await ipSeenWith(2)).toBe(REAL);
  });

  it("too many hops: the visitor's forged address is believed", async () => {
    expect(await ipSeenWith(3)).toBe(FORGED);
  });
});
