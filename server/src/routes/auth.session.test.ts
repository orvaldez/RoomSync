import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

vi.mock("../repositories/user.repository", () => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
}));

import * as userRepository from "../repositories/user.repository";
import app from "../app";

const findByEmail = vi.mocked(userRepository.findByEmail);
const findById = vi.mocked(userRepository.findById);

const PASSWORD = "correct-horse";
const USER = {
  id: "clx0000000000000000000000",
  name: "Orlando",
  email: "orlando@crimson.ua.edu",
  passwordHash: bcrypt.hashSync(PASSWORD, 10),
  createdAt: new Date("2026-09-18T00:00:00Z"),
};

/** Pull the session cookie's value out of a Set-Cookie header. */
function sessionIdFrom(res: request.Response): string | undefined {
  const raw = res.headers["set-cookie"];
  if (!raw) return undefined;
  const header = Array.isArray(raw) ? raw : [raw];
  const cookie = header.find((c) => c.startsWith("roomsync.sid="));
  return cookie?.split(";")[0].split("=")[1];
}

beforeEach(() => {
  vi.resetAllMocks();
  findByEmail.mockResolvedValue(null);
  findById.mockResolvedValue(null);
});

describe("POST /api/auth/login — main success scenario", () => {
  it("returns 200 with the user and sets a session cookie", async () => {
    findByEmail.mockResolvedValue(USER);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: USER.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: USER.id, email: USER.email });
    expect(sessionIdFrom(res)).toBeTruthy();
  });

  it("never returns the password hash", async () => {
    findByEmail.mockResolvedValue(USER);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: USER.email, password: PASSWORD });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("$2b$");
    expect(body).not.toContain(PASSWORD);
  });

  it("normalizes the email, so case does not prevent login", async () => {
    findByEmail.mockResolvedValue(USER);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "  ORLANDO@Crimson.UA.EDU  ", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(findByEmail).toHaveBeenCalledWith("orlando@crimson.ua.edu");
  });

  it("sets an httpOnly, SameSite=Lax cookie", async () => {
    findByEmail.mockResolvedValue(USER);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: USER.email, password: PASSWORD });

    const raw = res.headers["set-cookie"];
    const cookie = (Array.isArray(raw) ? raw : [raw]).join(";");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  it("issues a new session id on each login (session fixation)", async () => {
    findByEmail.mockResolvedValue(USER);
    const agent = request.agent(app);

    const first = await agent
      .post("/api/auth/login")
      .send({ email: USER.email, password: PASSWORD });
    const second = await agent
      .post("/api/auth/login")
      .send({ email: USER.email, password: PASSWORD });

    const firstId = sessionIdFrom(first);
    const secondId = sessionIdFrom(second);

    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    // An id fixed before authentication must not carry into the session.
    expect(secondId).not.toBe(firstId);
  });
});

describe("POST /api/auth/login — UC-02 extensions 3a and 4a", () => {
  it("returns 401 INVALID_CREDENTIALS when no account matches", async () => {
    findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 INVALID_CREDENTIALS when the password is wrong", async () => {
    findByEmail.mockResolvedValue(USER);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: USER.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns an identical response for unknown email and wrong password", async () => {
    findByEmail.mockResolvedValue(null);
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: PASSWORD });

    findByEmail.mockResolvedValue(USER);
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: USER.email, password: "wrong-password" });

    // Any difference here tells an unauthenticated caller which addresses
    // are registered.
    expect(unknown.status).toBe(wrongPassword.status);
    expect(unknown.body).toEqual(wrongPassword.body);
  });

  it("sets no session cookie on a failed login", async () => {
    findByEmail.mockResolvedValue(USER);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: USER.email, password: "wrong-password" });

    expect(sessionIdFrom(res)).toBeUndefined();
  });

  it("returns 400 VALIDATION_FAILED when fields are missing", async () => {
    const res = await request(app).post("/api/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.fields).toHaveProperty("email");
    expect(res.body.error.fields).toHaveProperty("password");
  });

  it("does not apply registration password rules to login", async () => {
    findByEmail.mockResolvedValue(USER);

    // "short" is below the registration minimum. Login must treat it as a
    // wrong password, not a validation error — otherwise the response tells
    // a guesser which passwords are even worth trying.
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: USER.email, password: "short" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 UNAUTHENTICATED without a session", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the signed-in user after login", async () => {
    findByEmail.mockResolvedValue(USER);
    findById.mockResolvedValue(USER);
    const agent = request.agent(app);

    await agent
      .post("/api/auth/login")
      .send({ email: USER.email, password: PASSWORD });
    const res = await agent.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: USER.id, email: USER.email });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("returns 401 when the session points at a deleted account", async () => {
    findByEmail.mockResolvedValue(USER);
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: USER.email, password: PASSWORD });

    // The account is gone but the cookie is still live.
    findById.mockResolvedValue(null);
    const res = await agent.get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("POST /api/auth/logout — UC-02 steps 7-9", () => {
  it("returns 204 and ends the session", async () => {
    findByEmail.mockResolvedValue(USER);
    findById.mockResolvedValue(USER);
    const agent = request.agent(app);

    await agent
      .post("/api/auth/login")
      .send({ email: USER.email, password: PASSWORD });
    await expect(
      agent.get("/api/auth/me").then((r) => r.status)
    ).resolves.toBe(200);

    const logout = await agent.post("/api/auth/logout");
    expect(logout.status).toBe(204);

    // UC-02 extension 9a: the same agent can no longer reach a protected route.
    const after = await agent.get("/api/auth/me");
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 when called without a session", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns an empty body", async () => {
    findByEmail.mockResolvedValue(USER);
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: USER.email, password: PASSWORD });

    const res = await agent.post("/api/auth/logout");

    expect(res.text).toBe("");
  });
});

describe("FR-03 — protected routes reject direct API calls", () => {
  it("rejects a forged session cookie", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", "roomsync.sid=s%3Afake-session-id.fake-signature");

    // The cookie is signed; an unsigned or wrongly-signed id yields no session.
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("does not leak the user list through an unauthenticated /me", async () => {
    findById.mockResolvedValue(USER);

    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain(USER.email);
    // The guard must run before any repository call.
    expect(findById).not.toHaveBeenCalled();
  });
});
