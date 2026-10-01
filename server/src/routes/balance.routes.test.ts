import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

// Every repository is mocked, so these tests exercise the HTTP boundary, both
// guards, and the services without a database.
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

vi.mock("../repositories/ledger.repository", () => ({
  findEntriesInvolving: vi.fn(),
  createSettlementChecked: vi.fn(),
  listSettlements: vi.fn(),
  lockLedger: vi.fn(),
}));

import * as userRepository from "../repositories/user.repository";
import * as householdRepository from "../repositories/household.repository";
import * as ledgerRepository from "../repositories/ledger.repository";
import app from "../app";

const findByEmail = vi.mocked(userRepository.findByEmail);
const findRole = vi.mocked(householdRepository.findRole);
const listMembers = vi.mocked(householdRepository.listMembers);
const findEntriesInvolving = vi.mocked(ledgerRepository.findEntriesInvolving);
const createSettlementChecked = vi.mocked(ledgerRepository.createSettlementChecked);
const listSettlements = vi.mocked(ledgerRepository.listSettlements);

const PASSWORD = "correct-horse";
const USER = {
  id: "clx0000000000000000000000",
  name: "Agustin",
  email: "agustin@crimson.ua.edu",
  passwordHash: bcrypt.hashSync(PASSWORD, 10),
  createdAt: new Date("2026-09-18T00:00:00Z"),
};
const ORLANDO = "clxORLANDO00000000000000";

const HOUSEHOLD_ID = "clx1111111111111111111111";
const BASE = `/api/households/${HOUSEHOLD_ID}`;

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
  findRole.mockImplementation(async (userId) =>
    userId === USER.id ? "OWNER" : userId === ORLANDO ? "MEMBER" : null
  );
  listMembers.mockResolvedValue([
    { userId: USER.id, name: "Agustin", role: "OWNER", joinedAt: new Date("2026-09-01") },
    { userId: ORLANDO, name: "Orlando", role: "MEMBER", joinedAt: new Date("2026-09-02") },
  ]);
  // Orlando owes the requester 42.01.
  const ledger = {
    debts: [{ debtorId: ORLANDO, creditorId: USER.id, amountCents: 4201 }],
    payments: [],
  };
  findEntriesInvolving.mockResolvedValue(ledger);
  createSettlementChecked.mockImplementation(async (settlement, check) => {
    check(ledger);
    return {
      id: "clxSETTLEMENT00000000000",
      householdId: settlement.householdId,
      from: { userId: settlement.fromUserId, name: "Orlando" },
      to: { userId: settlement.toUserId, name: "Agustin" },
      amountCents: settlement.amountCents,
      note: settlement.note,
      settledAt: new Date("2026-09-30T18:00:00.000Z"),
    };
  });
  listSettlements.mockResolvedValue([]);
});

describe("GET /api/households/:householdId/balances", () => {
  it("returns the requester's balances and totals in the contract's shape", async () => {
    const agent = await signedInAgent();

    const res = await agent.get(`${BASE}/balances`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      balances: [{ userId: ORLANDO, name: "Orlando", netCents: 4201 }],
      totals: { youOweCents: 0, owedToYouCents: 4201 },
    });
  });

  it("derives balances for the session's user", async () => {
    const agent = await signedInAgent();

    await agent.get(`${BASE}/balances`);

    expect(findEntriesInvolving).toHaveBeenCalledWith(HOUSEHOLD_ID, USER.id);
  });
});

describe("POST /api/households/:householdId/settlements", () => {
  it("returns 201 with the settlement", async () => {
    const agent = await signedInAgent();

    const res = await agent
      .post(`${BASE}/settlements`)
      .send({ fromUserId: ORLANDO, toUserId: USER.id, amountCents: 4201, note: "cash" });

    expect(res.status).toBe(201);
    expect(res.body.settlement).toEqual({
      id: "clxSETTLEMENT00000000000",
      from: { userId: ORLANDO, name: "Orlando" },
      to: { userId: USER.id, name: "Agustin" },
      amountCents: 4201,
      note: "cash",
      settledAt: "2026-09-30T18:00:00.000Z",
    });
  });

  it.each([
    ["VALIDATION_FAILED", 400, { fromUserId: ORLANDO, toUserId: USER.id, amountCents: 0 }],
    ["SAME_MEMBER", 400, { fromUserId: ORLANDO, toUserId: ORLANDO, amountCents: 100 }],
    [
      "MEMBER_NOT_IN_HOUSEHOLD",
      400,
      { fromUserId: "clxOUTSIDER0000000000000", toUserId: USER.id, amountCents: 100 },
    ],
    ["EXCEEDS_BALANCE", 409, { fromUserId: ORLANDO, toUserId: USER.id, amountCents: 4202 }],
  ])("returns %s", async (code, status, body) => {
    const agent = await signedInAgent();

    const res = await agent.post(`${BASE}/settlements`).send(body);

    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });
});

describe("GET /api/households/:householdId/settlements", () => {
  it("returns 200 with the household's settlements", async () => {
    const agent = await signedInAgent();

    const res = await agent.get(`${BASE}/settlements`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ settlements: [] });
    expect(listSettlements).toHaveBeenCalledWith(HOUSEHOLD_ID);
  });
});

describe("balance and settlement routes — authorization (UC-07 1a, FR-03)", () => {
  it("returns 401 without a session", async () => {
    const res = await request(app).get(`${BASE}/balances`);

    expect(res.status).toBe(401);
    expect(findEntriesInvolving).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", `${BASE}/balances`],
    ["POST", `${BASE}/settlements`],
    ["GET", `${BASE}/settlements`],
  ])("returns 404 HOUSEHOLD_NOT_FOUND to a non-member (%s %s)", async (method, url) => {
    findRole.mockResolvedValue(null);
    const agent = await signedInAgent();

    const res =
      method === "GET"
        ? await agent.get(url)
        : await agent
            .post(url)
            .send({ fromUserId: ORLANDO, toUserId: USER.id, amountCents: 100 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("HOUSEHOLD_NOT_FOUND");
    expect(findEntriesInvolving).not.toHaveBeenCalled();
    expect(createSettlementChecked).not.toHaveBeenCalled();
    expect(listSettlements).not.toHaveBeenCalled();
  });
});
