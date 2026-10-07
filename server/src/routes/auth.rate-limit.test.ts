import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import type { Express } from "express";

vi.mock("../repositories/user.repository", () => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
}));

import * as userRepository from "../repositories/user.repository";

const findByEmail = vi.mocked(userRepository.findByEmail);
const create = vi.mocked(userRepository.create);

const PASSWORD = "correct-horse";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

function userWith(email: string) {
  return {
    id: `id-${email}`,
    name: "Test",
    email,
    passwordHash: PASSWORD_HASH,
    createdAt: new Date("2026-10-07T00:00:00Z"),
  };
}

/**
 * The limits are read when the routes load and the counters live in memory,
 * so each test imports a fresh app with small limits. vitest.config.ts sets
 * them high for every other test file.
 */
async function appWithLimits(limits: Record<string, string>): Promise<Express> {
  for (const [name, value] of Object.entries(limits)) {
    vi.stubEnv(name, value);
  }
  vi.resetModules();
  return (await import("../app")).default;
}

function logIn(app: Express, email: string, password: string) {
  return request(app).post("/api/auth/login").send({ email, password });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Every address has an account with PASSWORD, so a wrong password is 401.
  findByEmail.mockImplementation(async (email) => userWith(email));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("login, limited per account email", () => {
  const LIMITS = {
    LOGIN_MAX_FAILURES_PER_EMAIL: "3",
    LOGIN_MAX_FAILURES_PER_IP: "100",
  };

  it("answers 429 RATE_LIMITED with Retry-After once the failures reach the limit", async () => {
    const app = await appWithLimits(LIMITS);

    for (let i = 0; i < 3; i++) {
      expect((await logIn(app, "sam@roomsync.test", "wrong")).status).toBe(401);
    }

    const res = await logIn(app, "sam@roomsync.test", "wrong");
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many failed login attempts. Try again in 15 minutes.",
      },
    });
    const retryAfter = Number(res.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
  });

  it("refuses even the right password while the account is limited", async () => {
    const app = await appWithLimits(LIMITS);
    for (let i = 0; i < 3; i++) {
      await logIn(app, "sam@roomsync.test", "wrong");
    }

    const res = await logIn(app, "sam@roomsync.test", PASSWORD);

    expect(res.status).toBe(429);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("lets other accounts log in while one is limited", async () => {
    const app = await appWithLimits(LIMITS);
    for (let i = 0; i < 5; i++) {
      await logIn(app, "sam@roomsync.test", "wrong");
    }

    expect((await logIn(app, "alex@roomsync.test", PASSWORD)).status).toBe(200);
  });

  it("counts the same account however the email is typed", async () => {
    const app = await appWithLimits(LIMITS);
    await logIn(app, "sam@roomsync.test", "wrong");
    await logIn(app, "SAM@roomsync.test", "wrong");
    await logIn(app, "  sam@RoomSync.test ", "wrong");

    expect((await logIn(app, "Sam@roomsync.test", "wrong")).status).toBe(429);
  });

  it("doesn't count successful logins", async () => {
    const app = await appWithLimits(LIMITS);

    for (let i = 0; i < 6; i++) {
      expect((await logIn(app, "sam@roomsync.test", PASSWORD)).status).toBe(200);
    }
  });
});

describe("login, limited per IP", () => {
  it("refuses an IP that fails across many accounts", async () => {
    const app = await appWithLimits({
      LOGIN_MAX_FAILURES_PER_EMAIL: "100",
      LOGIN_MAX_FAILURES_PER_IP: "4",
    });

    for (let i = 0; i < 4; i++) {
      expect((await logIn(app, `guess-${i}@roomsync.test`, "wrong")).status).toBe(401);
    }

    const res = await logIn(app, "someone-else@roomsync.test", PASSWORD);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("doesn't count attempts the account limit already refused", async () => {
    const app = await appWithLimits({
      LOGIN_MAX_FAILURES_PER_EMAIL: "2",
      LOGIN_MAX_FAILURES_PER_IP: "5",
    });

    // 2 real failures, then 10 refusals: only the 2 count against the IP.
    for (let i = 0; i < 12; i++) {
      await logIn(app, "sam@roomsync.test", "wrong");
    }

    expect((await logIn(app, "alex@roomsync.test", PASSWORD)).status).toBe(200);
  });
});

describe("registration, limited per IP", () => {
  it("answers 429 once the attempts reach the limit, whatever their outcome", async () => {
    findByEmail.mockResolvedValue(null);
    create.mockImplementation(async (user) => ({
      id: "clx0000000000000000000000",
      createdAt: new Date("2026-10-07T00:00:00Z"),
      ...user,
    }));
    const app = await appWithLimits({ REGISTER_MAX_PER_IP: "2" });

    const ok = await request(app)
      .post("/api/auth/register")
      .send({ name: "Sam", email: "sam@roomsync.test", password: PASSWORD });
    expect(ok.status).toBe(201);
    const invalid = await request(app).post("/api/auth/register").send({});
    expect(invalid.status).toBe(400);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Jo", email: "jo@roomsync.test", password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.error).toEqual({
      code: "RATE_LIMITED",
      message: "Too many sign-ups from this network. Try again in 15 minutes.",
    });
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });
});
