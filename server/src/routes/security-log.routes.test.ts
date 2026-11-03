import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

// Repositories mocked, so the real app runs without a database, as in the
// other route tests.
vi.mock("../repositories/user.repository", () => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../repositories/household.repository", () => ({
  createWithOwner: vi.fn(),
  findCurrentForUser: vi.fn(),
  hasMembership: vi.fn(),
  findRole: vi.fn(),
  listMembers: vi.fn(),
}));

import * as userRepository from "../repositories/user.repository";
import * as householdRepository from "../repositories/household.repository";
import app from "../app";

/**
 * #99 through the real app: what a failed login and a probe of another
 * household actually write to stdout. The pure rules are tested in
 * middleware/security-log.test.ts.
 */
const findByEmail = vi.mocked(userRepository.findByEmail);
const findRole = vi.mocked(householdRepository.findRole);

const PASSWORD = "correct-horse-battery";
const USER = {
  id: "clxUSER00000000000000000",
  name: "Agustin",
  email: "agustin@roomsync.test",
  passwordHash: bcrypt.hashSync(PASSWORD, 4),
  createdAt: new Date("2026-09-18T00:00:00Z"),
};

/** Captures what the app writes to stdout. */
function captureStdout(): { lines: () => string[] } {
  const written: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  return { lines: () => written.join("").split("\n").filter((l) => l.startsWith("{")) };
}

beforeEach(() => {
  vi.resetAllMocks();
  findByEmail.mockResolvedValue(null);
  findRole.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SECURITY_LOG;
});

describe("in the running app", () => {
  it("logs a failed login with no password, email, cookie or session id", async () => {
    process.env.SECURITY_LOG = "on";
    findByEmail.mockResolvedValue(USER);
    const agent = request.agent(app);
    // A real session first, so there is a cookie and a session id that must not leak.
    const ok = await agent.post("/api/auth/login").send({ email: USER.email, password: PASSWORD });
    const cookie = ok.headers["set-cookie"]?.[0] ?? "";
    const sessionId = decodeURIComponent(cookie.split(";")[0].split("=")[1] ?? "");
    const stdout = captureStdout();

    const res = await agent.post("/api/auth/login").send({ email: USER.email, password: "wrong-guess-1" });

    expect(res.status).toBe(401);
    const lines = stdout.lines();
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ event: "login_failed", code: "INVALID_CREDENTIALS", route: "/api/auth/login" });
    for (const secret of ["wrong-guess-1", PASSWORD, USER.email, "roomsync.sid", sessionId, cookie]) {
      if (secret) expect(lines[0]).not.toContain(secret);
    }
  });

  it("logs a signed-in member asking for another household, with their id", async () => {
    findByEmail.mockResolvedValue(USER);
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: USER.email, password: PASSWORD });
    process.env.SECURITY_LOG = "on";
    const stdout = captureStdout();

    const res = await agent.get("/api/households/clxSOMEONEELSES000000000/members");

    expect(res.status).toBe(404);
    expect(JSON.parse(stdout.lines()[0])).toMatchObject({
      event: "household_not_found",
      userId: USER.id,
      route: "/api/households/:householdId/members",
    });
  });

  it("stays quiet under the test runner unless switched on", async () => {
    const stdout = captureStdout();
    await request(app).post("/api/auth/login").send({ email: USER.email, password: "wrong" });
    expect(stdout.lines()).toHaveLength(0);
  });
});
