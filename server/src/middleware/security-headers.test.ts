import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import app from "../app";
import { securityHeaders } from "./security-headers";

/**
 * OWASP A02:2025 (security misconfiguration) and threat model A4 and S4:
 * every response carries the security headers, and none advertises Express.
 */
const EXPECTED = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "cross-origin-resource-policy": "same-origin",
  "cache-control": "no-store",
};

describe("security headers", () => {
  it("are on a successful response", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.headers).toMatchObject(EXPECTED);
  });

  it("are on error responses too", async () => {
    const unauthenticated = await request(app).get("/api/auth/me");
    const malformed = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(unauthenticated.status).toBe(401);
    expect(malformed.status).toBe(400);
    for (const res of [unauthenticated, malformed]) {
      expect(res.headers).toMatchObject(EXPECTED);
    }
  });

  it("don't advertise the framework", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("leave out HSTS outside production, where there is no HTTPS", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("add HSTS in production, behind the TLS proxy", async () => {
    const production = express().use(securityHeaders("production")).get("/", (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(production).get("/");

    expect(res.headers["strict-transport-security"]).toBe("max-age=15552000; includeSubDomains");
  });
});
