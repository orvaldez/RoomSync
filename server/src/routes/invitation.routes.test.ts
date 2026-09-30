import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

// Every repository is mocked, so these tests exercise the HTTP boundary, the
// guards, and the service without a database.
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

vi.mock("../repositories/invitation.repository", () => ({
  create: vi.fn(),
  findByToken: vi.fn(),
  markExpired: vi.fn(),
  acceptIntoHousehold: vi.fn(),
}));

import * as userRepository from "../repositories/user.repository";
import * as householdRepository from "../repositories/household.repository";
import * as invitationRepository from "../repositories/invitation.repository";
import app from "../app";

const findByEmail = vi.mocked(userRepository.findByEmail);
const findRole = vi.mocked(householdRepository.findRole);
const hasMembership = vi.mocked(householdRepository.hasMembership);
const create = vi.mocked(invitationRepository.create);
const findByToken = vi.mocked(invitationRepository.findByToken);
const acceptIntoHousehold = vi.mocked(invitationRepository.acceptIntoHousehold);

const PASSWORD = "correct-horse";
const USER = {
  id: "clx0000000000000000000000",
  name: "Agustin",
  email: "agustin@crimson.ua.edu",
  passwordHash: bcrypt.hashSync(PASSWORD, 10),
  createdAt: new Date("2026-09-18T00:00:00Z"),
};

const HOUSEHOLD_ID = "clx1111111111111111111111";
const TOKEN = "b".repeat(43);

const PENDING: invitationRepository.InvitationWithHousehold = {
  id: "clxINVITATION00000000000",
  householdId: HOUSEHOLD_ID,
  token: TOKEN,
  status: "PENDING",
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  createdAt: new Date("2026-09-29T00:00:00Z"),
  household: {
    id: HOUSEHOLD_ID,
    name: "Apartment 4B",
    createdAt: new Date("2026-09-01T00:00:00Z"),
  },
};

/** A supertest agent carrying a real session cookie from the login endpoint. */
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
  create.mockImplementation(async (input) => ({
    id: "clxINVITATION00000000000",
    householdId: input.householdId,
    token: input.token,
    status: "PENDING",
    expiresAt: input.expiresAt,
    createdAt: new Date(),
  }));
  findByToken.mockResolvedValue(PENDING);
  hasMembership.mockResolvedValue(false);
  acceptIntoHousehold.mockResolvedValue(true);
});

describe("POST /api/households/:householdId/invitations", () => {
  it("returns 201 with the invitation for the owner", async () => {
    findRole.mockResolvedValue("OWNER");
    const agent = await signedInAgent();

    const res = await agent.post(`/api/households/${HOUSEHOLD_ID}/invitations`);

    expect(res.status).toBe(201);
    expect(res.body.invitation).toMatchObject({
      id: "clxINVITATION00000000000",
      status: "PENDING",
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(Object.keys(res.body.invitation).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "status",
      "token",
    ]);
  });

  it("returns 403 NOT_HOUSEHOLD_OWNER to a member, creating nothing (UC-04 1a)", async () => {
    findRole.mockResolvedValue("MEMBER");
    const agent = await signedInAgent();

    const res = await agent.post(`/api/households/${HOUSEHOLD_ID}/invitations`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_HOUSEHOLD_OWNER");
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 404 HOUSEHOLD_NOT_FOUND to a non-member", async () => {
    findRole.mockResolvedValue(null);
    const agent = await signedInAgent();

    const res = await agent.post(`/api/households/${HOUSEHOLD_ID}/invitations`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("HOUSEHOLD_NOT_FOUND");
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).post(`/api/households/${HOUSEHOLD_ID}/invitations`);

    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("GET /api/invitations/:token", () => {
  it("returns the household name and expiry, and nothing else", async () => {
    const agent = await signedInAgent();

    const res = await agent.get(`/api/invitations/${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.invitation).toEqual({
      householdName: "Apartment 4B",
      expiresAt: PENDING.expiresAt.toISOString(),
    });
  });

  it("returns 404 INVITATION_INVALID for an unknown token", async () => {
    findByToken.mockResolvedValue(null);
    const agent = await signedInAgent();

    const res = await agent.get("/api/invitations/not-a-real-token");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INVITATION_INVALID");
  });

  it("returns 410 INVITATION_EXPIRED for an expired invitation", async () => {
    findByToken.mockResolvedValue({
      ...PENDING,
      expiresAt: new Date(Date.now() - 1000),
    });
    const agent = await signedInAgent();

    const res = await agent.get(`/api/invitations/${TOKEN}`);

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("INVITATION_EXPIRED");
  });

  it("returns 401 without a session, revealing nothing", async () => {
    const res = await request(app).get(`/api/invitations/${TOKEN}`);

    expect(res.status).toBe(401);
    expect(findByToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/invitations/:token/accept", () => {
  it("returns 200 with the household and MEMBER role", async () => {
    findRole.mockResolvedValue(null);
    const agent = await signedInAgent();

    const res = await agent.post(`/api/invitations/${TOKEN}/accept`);

    expect(res.status).toBe(200);
    expect(res.body.household).toMatchObject({
      id: HOUSEHOLD_ID,
      name: "Apartment 4B",
      role: "MEMBER",
    });
  });

  it("joins the session's user, not anyone named in the body", async () => {
    findRole.mockResolvedValue(null);
    const agent = await signedInAgent();

    await agent
      .post(`/api/invitations/${TOKEN}/accept`)
      .send({ userId: "clxSOMEONEELSE0000000000" });

    expect(acceptIntoHousehold).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER.id })
    );
  });

  it("returns 409 ALREADY_IN_HOUSEHOLD for a member of another household", async () => {
    findRole.mockResolvedValue(null);
    hasMembership.mockResolvedValue(true);
    const agent = await signedInAgent();

    const res = await agent.post(`/api/invitations/${TOKEN}/accept`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_IN_HOUSEHOLD");
    expect(acceptIntoHousehold).not.toHaveBeenCalled();
  });

  it("returns 404 for a used invitation", async () => {
    findRole.mockResolvedValue(null);
    findByToken.mockResolvedValue({ ...PENDING, status: "ACCEPTED" });
    const agent = await signedInAgent();

    const res = await agent.post(`/api/invitations/${TOKEN}/accept`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INVITATION_INVALID");
  });

  it("returns 401 without a session and joins no one", async () => {
    const res = await request(app).post(`/api/invitations/${TOKEN}/accept`);

    expect(res.status).toBe(401);
    expect(acceptIntoHousehold).not.toHaveBeenCalled();
  });
});
