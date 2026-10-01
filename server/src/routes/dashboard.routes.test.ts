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
  findWithRole: vi.fn(),
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

vi.mock("../repositories/chore.repository", () => ({
  create: vi.fn(),
  listOpen: vi.fn(),
  listOpenAssignedTo: vi.fn(),
  listCompleted: vi.fn(),
  findInHousehold: vi.fn(),
  updateOpen: vi.fn(),
  markComplete: vi.fn(),
}));

vi.mock("../repositories/expense.repository", () => ({
  createWithShares: vi.fn(),
  listForHousehold: vi.fn(),
  listRecent: vi.fn(),
  findInHousehold: vi.fn(),
}));

import * as userRepository from "../repositories/user.repository";
import * as householdRepository from "../repositories/household.repository";
import * as ledgerRepository from "../repositories/ledger.repository";
import * as choreRepository from "../repositories/chore.repository";
import * as expenseRepository from "../repositories/expense.repository";
import app from "../app";

const findByEmail = vi.mocked(userRepository.findByEmail);
const findRole = vi.mocked(householdRepository.findRole);
const findWithRole = vi.mocked(householdRepository.findWithRole);
const listMembers = vi.mocked(householdRepository.listMembers);
const findEntriesInvolving = vi.mocked(ledgerRepository.findEntriesInvolving);
const listSettlements = vi.mocked(ledgerRepository.listSettlements);
const listOpenAssignedTo = vi.mocked(choreRepository.listOpenAssignedTo);
const listCompleted = vi.mocked(choreRepository.listCompleted);
const listRecent = vi.mocked(expenseRepository.listRecent);

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
const URL = `/api/households/${HOUSEHOLD_ID}/dashboard`;

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
  findRole.mockImplementation(async (userId) => (userId === USER.id ? "OWNER" : null));
  findWithRole.mockResolvedValue({
    id: HOUSEHOLD_ID,
    name: "Apartment 4B",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    role: "OWNER",
  });
  listMembers.mockResolvedValue([
    { userId: USER.id, name: "Agustin", role: "OWNER", joinedAt: new Date("2026-09-01T00:00:00Z") },
    { userId: ORLANDO, name: "Orlando", role: "MEMBER", joinedAt: new Date("2026-09-02T00:00:00Z") },
  ]);
  // The requester owes Orlando 12.50.
  findEntriesInvolving.mockResolvedValue({
    debts: [{ debtorId: USER.id, creditorId: ORLANDO, amountCents: 1250 }],
    payments: [],
  });
  listOpenAssignedTo.mockResolvedValue([
    {
      id: "clxCHORE0000000000000000",
      householdId: HOUSEHOLD_ID,
      title: "Take out trash",
      description: null,
      assignee: { userId: USER.id, name: "Agustin" },
      dueDate: new Date("2026-10-02T00:00:00Z"),
      isComplete: false,
      completedAt: null,
      createdAt: new Date("2026-09-25T00:00:00Z"),
    },
  ]);
  listRecent.mockResolvedValue([
    {
      id: "clxEXPENSE00000000000000",
      householdId: HOUSEHOLD_ID,
      description: "Groceries",
      totalAmountCents: 2500,
      expenseDate: new Date("2026-09-28T00:00:00Z"),
      paidBy: { userId: ORLANDO, name: "Orlando" },
      splitMethod: "EQUAL",
      shares: [
        { userId: USER.id, name: "Agustin", amountOwedCents: 1250, percentBasisPoints: null },
        { userId: ORLANDO, name: "Orlando", amountOwedCents: 1250, percentBasisPoints: null },
      ],
      createdAt: new Date("2026-09-28T15:00:00Z"),
    },
  ]);
  listSettlements.mockResolvedValue([
    {
      id: "clxSETTLEMENT00000000000",
      householdId: HOUSEHOLD_ID,
      from: { userId: USER.id, name: "Agustin" },
      to: { userId: ORLANDO, name: "Orlando" },
      amountCents: 1000,
      note: null,
      settledAt: new Date("2026-09-29T09:00:00Z"),
    },
  ]);
  listCompleted.mockResolvedValue([]);
});

describe("GET /api/households/:householdId/dashboard", () => {
  it("returns 401 without a session (UC-10 1a)", async () => {
    const res = await request(app).get(URL);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 404 to a non-member, the same as a missing household", async () => {
    findRole.mockResolvedValue(null);
    const agent = await signedInAgent();

    const res = await agent.get(URL);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("HOUSEHOLD_NOT_FOUND");
    expect(listMembers).not.toHaveBeenCalled();
  });

  it("returns the whole screen in one response, in the contract's shape", async () => {
    const agent = await signedInAgent();

    const res = await agent.get(URL);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      "balances",
      "household",
      "members",
      "recentActivity",
      "upcomingChores",
    ]);
    expect(res.body.household).toEqual({
      id: HOUSEHOLD_ID,
      name: "Apartment 4B",
      createdAt: "2026-09-01T00:00:00.000Z",
      role: "OWNER",
    });
    expect(res.body.members).toHaveLength(2);
    expect(res.body.balances).toEqual({
      balances: [{ userId: ORLANDO, name: "Orlando", netCents: -1250 }],
      totals: { youOweCents: 1250, owedToYouCents: 0 },
    });
    expect(res.body.upcomingChores).toEqual([
      expect.objectContaining({ title: "Take out trash", dueDate: "2026-10-02", isComplete: false }),
    ]);
  });

  it("returns recent activity newest first, each item tagged with its type", async () => {
    const agent = await signedInAgent();

    const res = await agent.get(URL);

    expect(res.body.recentActivity).toEqual([
      expect.objectContaining({
        type: "SETTLEMENT",
        at: "2026-09-29T09:00:00.000Z",
        settlement: expect.objectContaining({ amountCents: 1000 }),
      }),
      expect.objectContaining({
        type: "EXPENSE",
        at: "2026-09-28T15:00:00.000Z",
        expense: expect.objectContaining({ description: "Groceries", expenseDate: "2026-09-28" }),
      }),
    ]);
  });

  it("never exposes members' emails (NFR-06)", async () => {
    const agent = await signedInAgent();

    const res = await agent.get(URL);

    expect(JSON.stringify(res.body)).not.toContain("@");
  });
});
