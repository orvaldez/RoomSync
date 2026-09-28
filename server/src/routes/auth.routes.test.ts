import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Same reason as the service tests: keep the real repository, and therefore
// Prisma, out of the import graph. The service itself runs for real here, so
// these exercise validation and hashing end to end through HTTP.
vi.mock("../repositories/user.repository", () => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
}));

import * as userRepository from "../repositories/user.repository";
import { UniqueConstraintError } from "../repositories/errors";
import app from "../app";

const findByEmail = vi.mocked(userRepository.findByEmail);
const create = vi.mocked(userRepository.create);

const VALID = {
  name: "Orlando",
  email: "orlando@crimson.ua.edu",
  password: "correct-horse",
};

beforeEach(() => {
  vi.resetAllMocks();
  findByEmail.mockResolvedValue(null);
  create.mockImplementation(async (user) => ({
    id: "clx0000000000000000000000",
    createdAt: new Date("2026-09-18T00:00:00Z"),
    ...user,
  }));
});

describe("POST /api/auth/register", () => {
  it("returns 201 and the new user", async () => {
    const res = await request(app).post("/api/auth/register").send(VALID);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: "Orlando",
      email: "orlando@crimson.ua.edu",
    });
    expect(res.body.user.id).toEqual(expect.any(String));
  });

  it("never includes the password or its hash in the response", async () => {
    const res = await request(app).post("/api/auth/register").send(VALID);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(VALID.password);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("$2b$");
  });

  it("returns 400 with field errors for invalid input", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "", email: "nope", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.fields).toHaveProperty("name");
    expect(res.body.error.fields).toHaveProperty("email");
    expect(res.body.error.fields).toHaveProperty("password");
  });

  it("returns 400 when the body is empty", async () => {
    const res = await request(app).post("/api/auth/register").send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 when no body is sent at all", async () => {
    const res = await request(app).post("/api/auth/register");

    expect(res.status).toBe(400);
  });

  it("returns 409 when the email is already registered", async () => {
    findByEmail.mockResolvedValue({
      id: "existing",
      name: "Someone",
      email: VALID.email,
      passwordHash: "$2b$10$hash",
      createdAt: new Date(),
    });

    const res = await request(app).post("/api/auth/register").send(VALID);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_UNAVAILABLE");
    expect(res.body.error.message).not.toContain(VALID.email);
  });

  it("returns 500 with a generic message when the database fails", async () => {
    create.mockRejectedValue(new Error("relation \"users\" does not exist"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const res = await request(app).post("/api/auth/register").send(VALID);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    // The underlying error names a table; the response must not.
    expect(JSON.stringify(res.body)).not.toContain("users");
    expect(JSON.stringify(res.body)).not.toContain("relation");

    consoleError.mockRestore();
  });


  it("returns 400 INVALID_JSON for a malformed body", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send('{"name": "Orlando", ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
    // Express's default handler returns an HTML page; the contract requires JSON.
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("maps a concurrent duplicate registration to 409, not 500", async () => {
    // Both requests pass findByEmail; the unique index rejects the second.
    // The repository turns Prisma's P2002 into this, so the mock throws what
    // the real repository would.
    findByEmail.mockResolvedValue(null);
    create.mockRejectedValue(new UniqueConstraintError("email"));

    const res = await request(app).post("/api/auth/register").send(VALID);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_UNAVAILABLE");
  });

  it("ignores extra fields a client tries to set", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ ...VALID, id: "attacker-chosen", role: "OWNER" });

    const stored = create.mock.calls[0][0];
    expect(stored).not.toHaveProperty("id");
    expect(stored).not.toHaveProperty("role");
  });
});

describe("GET /api/health still works", () => {
  it("is unaffected by the new routes", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "roomsync-api" });
  });
});
