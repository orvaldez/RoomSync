import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

// Both repositories are mocked, so these tests exercise the HTTP boundary,
// the guard, and the service without a database.
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

const findByEmail = vi.mocked(userRepository.findByEmail);
const createWithOwner = vi.mocked(householdRepository.createWithOwner);
const findCurrentForUser = vi.mocked(householdRepository.findCurrentForUser);
const hasMembership = vi.mocked(householdRepository.hasMembership);
const findRole = vi.mocked(householdRepository.findRole);
const listMembers = vi.mocked(householdRepository.listMembers);

const PASSWORD = "correct-horse";
const USER = {
  id: "clx0000000000000000000000",
  name: "Agustin",
  email: "agustin@crimson.ua.edu",
  passwordHash: bcrypt.hashSync(PASSWORD, 10),
  createdAt: new Date("2026-09-18T00:00:00Z"),
};

const HOUSEHOLD = {
  id: "clx1111111111111111111111",
  name: "Apartment 4B",
  createdAt: new Date("2026-09-29T00:00:00Z"),
  role: "OWNER" as const,
};

/**
 * A supertest agent carrying a real session cookie, obtained through the
 * actual login endpoint rather than by faking `req.session`. That way these
 * tests prove `requireAuth` accepts what `POST /api/auth/login` issues.
 */
async function signedInAgent() {
  const agent = request.agent(app);
  findByEmail.mockResolvedValue(USER);

  const res = await agent
    .post("/api/auth/login")
    .send({ email: USER.email, password: PASSWORD });

  expect(res.status).toBe(200);
  return agent;
}

beforeEach(() => {
  vi.resetAllMocks();
  findByEmail.mockResolvedValue(null);
  hasMembership.mockResolvedValue(false);
  findCurrentForUser.mockResolvedValue(null);
  createWithOwner.mockImplementation(async ({ name }) => ({
    ...HOUSEHOLD,
    name,
  }));
});

describe("POST /api/households — main success scenario", () => {
  it("returns 201 with the household and the creator as OWNER", async () => {
    const agent = await signedInAgent();

    const res = await agent
      .post("/api/households")
      .send({ name: "Apartment 4B" });

    expect(res.status).toBe(201);
    expect(res.body.household).toMatchObject({
      id: HOUSEHOLD.id,
      name: "Apartment 4B",
      role: "OWNER",
    });
    expect(res.body.household.createdAt).toBeTruthy();
  });

  it("creates the household for the session's user, not one from the body", async () => {
    const agent = await signedInAgent();

    await agent
      .post("/api/households")
      .send({ name: "Apartment 4B", ownerUserId: "clxSOMEONEELSE0000000000" });

    expect(createWithOwner).toHaveBeenCalledWith({
      name: "Apartment 4B",
      ownerUserId: USER.id,
    });
  });

  it("trims the name before storing it", async () => {
    const agent = await signedInAgent();

    await agent.post("/api/households").send({ name: "  Apartment 4B  " });

    expect(createWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Apartment 4B" })
    );
  });
});

describe("POST /api/households — UC-03 extension 3a, invalid name", () => {
  it("returns 400 VALIDATION_FAILED with the field named", async () => {
    const agent = await signedInAgent();

    const res = await agent.post("/api/households").send({ name: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.fields.name).toEqual(expect.any(String));
  });

  it("returns 400 when the name is missing entirely", async () => {
    const agent = await signedInAgent();

    const res = await agent.post("/api/households").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("creates nothing when validation fails", async () => {
    const agent = await signedInAgent();

    await agent.post("/api/households").send({ name: "" });

    expect(createWithOwner).not.toHaveBeenCalled();
  });
});

describe("POST /api/households — UC-03 extension 1a, already in a household", () => {
  it("returns 409 ALREADY_IN_HOUSEHOLD", async () => {
    const agent = await signedInAgent();
    hasMembership.mockResolvedValue(true);

    const res = await agent
      .post("/api/households")
      .send({ name: "Apartment 4B" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_IN_HOUSEHOLD");
  });

  it("creates no second household", async () => {
    const agent = await signedInAgent();
    hasMembership.mockResolvedValue(true);

    await agent.post("/api/households").send({ name: "Apartment 4B" });

    expect(createWithOwner).not.toHaveBeenCalled();
  });
});

describe("GET /api/households/current", () => {
  it("returns the household the requester belongs to", async () => {
    const agent = await signedInAgent();
    findCurrentForUser.mockResolvedValue({ ...HOUSEHOLD, role: "MEMBER" });

    const res = await agent.get("/api/households/current");

    expect(res.status).toBe(200);
    expect(res.body.household).toMatchObject({
      id: HOUSEHOLD.id,
      name: HOUSEHOLD.name,
      role: "MEMBER",
    });
  });

  it("returns 200 with null when the requester has no household", async () => {
    const agent = await signedInAgent();
    findCurrentForUser.mockResolvedValue(null);

    const res = await agent.get("/api/households/current");

    // Having no household is a normal state, not an error (contract Section 4).
    expect(res.status).toBe(200);
    expect(res.body.household).toBeNull();
  });

  it("looks the household up for the session's user", async () => {
    const agent = await signedInAgent();

    await agent.get("/api/households/current");

    expect(findCurrentForUser).toHaveBeenCalledWith(USER.id);
  });
});

/**
 * US-02 acceptance criterion: "Protected household information is inaccessible
 * without authentication." #37 built and tested the guard, but no household
 * endpoint existed then to point it at. These close that out on real household
 * routes (FR-03, UC-02 extension 9a).
 */
describe("FR-03 — household routes reject unauthenticated requests", () => {
  it("returns 401 UNAUTHENTICATED on POST without a session", async () => {
    const res = await request(app)
      .post("/api/households")
      .send({ name: "Apartment 4B" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 UNAUTHENTICATED on GET current without a session", async () => {
    const res = await request(app).get("/api/households/current");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("creates nothing when the request is unauthenticated", async () => {
    await request(app).post("/api/households").send({ name: "Apartment 4B" });

    expect(hasMembership).not.toHaveBeenCalled();
    expect(createWithOwner).not.toHaveBeenCalled();
  });

  it("rejects a forged session cookie", async () => {
    const res = await request(app)
      .get("/api/households/current")
      .set("Cookie", "roomsync.sid=s%3Aforged.notavalidsignature");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects requests after logout", async () => {
    const agent = await signedInAgent();
    await agent.post("/api/auth/logout");

    const res = await agent.get("/api/households/current");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("GET /api/households/:householdId/members", () => {
  const MEMBERS = [
    {
      userId: USER.id,
      name: "Agustin",
      role: "OWNER" as const,
      joinedAt: new Date("2026-09-28T00:00:00Z"),
    },
    {
      userId: "clx2222222222222222222222",
      name: "Orlando",
      role: "MEMBER" as const,
      joinedAt: new Date("2026-09-29T00:00:00Z"),
    },
  ];

  it("returns 200 with the members for a member of the household", async () => {
    const agent = await signedInAgent();
    findRole.mockResolvedValue("MEMBER");
    listMembers.mockResolvedValue(MEMBERS);

    const res = await agent.get(`/api/households/${HOUSEHOLD.id}/members`);

    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([
      {
        userId: USER.id,
        name: "Agustin",
        role: "OWNER",
        joinedAt: "2026-09-28T00:00:00.000Z",
      },
      {
        userId: "clx2222222222222222222222",
        name: "Orlando",
        role: "MEMBER",
        joinedAt: "2026-09-29T00:00:00.000Z",
      },
    ]);
  });

  it("checks membership for the session's user and the household in the URL", async () => {
    const agent = await signedInAgent();
    findRole.mockResolvedValue("OWNER");
    listMembers.mockResolvedValue(MEMBERS);

    await agent.get(`/api/households/${HOUSEHOLD.id}/members`);

    expect(findRole).toHaveBeenCalledWith(USER.id, HOUSEHOLD.id);
    expect(listMembers).toHaveBeenCalledWith(HOUSEHOLD.id);
  });

  it("never includes a member's email (MemberPublic, NFR-06)", async () => {
    const agent = await signedInAgent();
    findRole.mockResolvedValue("MEMBER");
    listMembers.mockResolvedValue(MEMBERS);

    const res = await agent.get(`/api/households/${HOUSEHOLD.id}/members`);

    for (const member of res.body.members) {
      expect(member).not.toHaveProperty("email");
    }
  });
});

/**
 * Contract Section 1 and decision 5: a household the requester does not
 * belong to answers exactly like one that does not exist. These pin that
 * down on the first household-scoped route, since every later one reuses the
 * same guard.
 */
describe("requireHouseholdMember — non-members get 404 HOUSEHOLD_NOT_FOUND", () => {
  it("returns 404 when the requester is not a member", async () => {
    const agent = await signedInAgent();
    findRole.mockResolvedValue(null);

    const res = await agent.get(`/api/households/${HOUSEHOLD.id}/members`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("HOUSEHOLD_NOT_FOUND");
  });

  it("answers a real household and a made-up id identically", async () => {
    const agent = await signedInAgent();
    findRole.mockResolvedValue(null);

    const real = await agent.get(`/api/households/${HOUSEHOLD.id}/members`);
    const madeUp = await agent.get("/api/households/does-not-exist/members");

    expect(madeUp.status).toBe(real.status);
    expect(madeUp.body).toEqual(real.body);
  });

  it("reads nothing from the household when membership fails", async () => {
    const agent = await signedInAgent();
    findRole.mockResolvedValue(null);

    await agent.get(`/api/households/${HOUSEHOLD.id}/members`);

    expect(listMembers).not.toHaveBeenCalled();
  });

  it("returns 401, not 404, without a session", async () => {
    const res = await request(app).get(
      `/api/households/${HOUSEHOLD.id}/members`
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(findRole).not.toHaveBeenCalled();
  });

  it("does not treat /households/current as a household id", async () => {
    const agent = await signedInAgent();

    const res = await agent.get("/api/households/current");

    expect(res.status).toBe(200);
    expect(findRole).not.toHaveBeenCalled();
  });
});
