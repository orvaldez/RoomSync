import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { CLOUDFLARE_RANGES, TRUSTED_PROXIES } from "./trusted-proxies";

/**
 * The chains measured on Render on November 4, 2026 (#117,
 * `docs/process/deployment.md` §5), replayed through Express with the trust
 * list `app.ts` uses in production. Every request carries a forged
 * `X-Forwarded-For` entry the "visitor" typed themselves.
 *
 * Supertest connects from 127.0.0.1, standing in for the Render proxy that
 * connects to the server (10.x in production; both are trusted).
 */
const FORGED = "203.0.113.7"; // what the visitor claims to be
const VISITOR = "198.51.100.20"; // who they really are
const CLOUDFLARE_A = "104.23.243.158"; // seen in the logs, in 104.16.0.0/13
const CLOUDFLARE_B = "104.23.243.11"; // seen at 4 hops through the site: the visitor's own Cloudflare hop
const RENDER_A = "10.31.71.133"; // seen in the logs
const RENDER_B = "10.25.218.5"; // seen in the logs

/** Straight to roomsync-api: the visitor was 3 hops back. */
const DIRECT = [FORGED, VISITOR, CLOUDFLARE_A, RENDER_A];
/**
 * Through the static site's /api rewrite: the visitor was 5 hops back. The
 * visitor's request reaches Cloudflare (B), then the rewrite's own request
 * crosses Cloudflare again (A) before Render's proxies.
 */
const THROUGH_SITE = [FORGED, VISITOR, CLOUDFLARE_B, CLOUDFLARE_A, RENDER_A, RENDER_B];

async function ipSeen(trust: unknown, chain: string[]): Promise<string> {
  const app = express();
  app.set("trust proxy", trust);
  app.get("/ip", (req, res) => {
    res.json({ ip: req.ip });
  });
  const res = await request(app).get("/ip").set("X-Forwarded-For", chain.join(", "));
  return res.body.ip;
}

describe("trusting Render's and Cloudflare's proxies by address (#117)", () => {
  it("finds the visitor on a request straight to the API", async () => {
    expect(await ipSeen(TRUSTED_PROXIES, DIRECT)).toBe(VISITOR);
  });

  it("finds the visitor on a request through the site's /api rewrite", async () => {
    expect(await ipSeen(TRUSTED_PROXIES, THROUGH_SITE)).toBe(VISITOR);
  });

  it("never believes the visitor's own forged entry, however many they add", async () => {
    const pileOfForgeries = ["1.2.3.4", CLOUDFLARE_A, "10.0.0.1", FORGED];
    expect(await ipSeen(TRUSTED_PROXIES, [...pileOfForgeries, VISITOR, CLOUDFLARE_A, RENDER_A])).toBe(
      VISITOR
    );
  });

  it("known gap: a sender inside Cloudflare's network is trusted, so its forgery is believed", async () => {
    // A Cloudflare Worker, for example, connects from a Cloudflare address.
    const workerAddress = "104.16.0.10";
    expect(await ipSeen(TRUSTED_PROXIES, [FORGED, workerAddress, CLOUDFLARE_A, RENDER_A])).toBe(
      FORGED
    );
  });
});

describe("why a hop count couldn't work (#117, kept as the record)", () => {
  it("3 hops: right straight to the API, but a Cloudflare address through the site", async () => {
    expect(await ipSeen(3, DIRECT)).toBe(VISITOR);
    expect(await ipSeen(3, THROUGH_SITE)).toBe(CLOUDFLARE_A);
  });

  it("5 hops: right through the site, but the forged address straight to the API", async () => {
    expect(await ipSeen(5, THROUGH_SITE)).toBe(VISITOR);
    expect(await ipSeen(5, DIRECT)).toBe(FORGED);
  });
});

describe("CLOUDFLARE_RANGES", () => {
  it("covers both Cloudflare addresses seen in Render's logs", async () => {
    // A request whose only proxies are those two must come out as the visitor.
    expect(await ipSeen([...CLOUDFLARE_RANGES, "loopback"], [VISITOR, CLOUDFLARE_A, CLOUDFLARE_B])).toBe(
      VISITOR
    );
  });

  it("is a list of CIDR ranges Express accepts", async () => {
    for (const range of CLOUDFLARE_RANGES) {
      expect(range).toMatch(/^[0-9a-f.:]+\/\d{1,3}$/);
    }
    // Express compiles the list when it is set; a malformed entry throws here.
    await expect(ipSeen(TRUSTED_PROXIES, [VISITOR])).resolves.toBe(VISITOR);
  });
});
