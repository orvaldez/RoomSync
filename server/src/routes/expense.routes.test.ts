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

vi.mock("../repositories/expense.repository", () => ({
  createWithShares: vi.fn(),
  listForHousehold: vi.fn(),
  findInHousehold: vi.fn(),
}));

import * as userRepository from "../repositories/user.repository";
import * as householdRepository from "../repositories/household.repository";
import * as expenseRepository from "../repositories/expense.repository";
import app from "../app";

const findByEmail = vi.mocked(userRepository.findByEmail);
const findRole = vi.mocked(householdRepository.findRole);
const listMembers = vi.mocked(householdRepository.listMembers);
const createWithShares = vi.mocked(expenseRepository.createWithShares);
const listForHousehold = vi.mocked(expenseRepository.listForHousehold);
const findInHousehold = vi.mocked(expenseRepository.findInHousehold);

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
const EXPENSES_URL = `/api/households/${HOUSEHOLD_ID}/expenses`;

const MEMBERS = [
  { userId: USER.id, name: "Agustin", role: "OWNER" as const, joinedAt: new Date("2026-09-01") },
  { userId: ORLANDO, name: "Orlando", role: "MEMBER" as const, joinedAt: new Date("2026-09-02") },
];

const BODY = {
  description: "Electricity",
  totalAmountCents: 8401,
  expenseDate: "2026-09-27",
  paidByUserId: USER.id,
  splitMethod: "EQUAL",
  participants: [{ userId: USER.id }, { userId: ORLANDO }],
};

const STORED: expenseRepository.ExpenseRecord = {
  id: "clxEXPENSE00000000000000",
  householdId: HOUSEHOLD_ID,
  description: "Electricity",
  totalAmountCents: 8401,
  expenseDate: new Date("2026-09-27T00:00:00.000Z"),
  paidBy: { userId: USER.id, name: "Agustin" },
  splitMethod: "EQUAL",
  shares: [
    { userId: USER.id, name: "Agustin", amountOwedCents: 4201, percentBasisPoints: null },
    { userId: ORLANDO, name: "Orlando", amountOwedCents: 4200, percentBasisPoints: null },
  ],
  createdAt: new Date("2026-09-29T17:30:00.000Z"),
};

/**
 * A supertest agent carrying a real session cookie from the actual login
 * endpoint, as in household.routes.test.ts.
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
  findRole.mockResolvedValue("OWNER");
  listMembers.mockResolvedValue(MEMBERS);
  createWithShares.mockResolvedValue(STORED);
});

describe("POST /api/households/:householdId/expenses", () => {
  it("returns 201 with the expense as ExpensePublic", async () => {
    const agent = await signedInAgent();

    const res = await agent.post(EXPENSES_URL).send(BODY);

    expect(res.status).toBe(201);
    expect(res.body.expense).toEqual({
      id: STORED.id,
      description: "Electricity",
      totalAmountCents: 8401,
      expenseDate: "2026-09-27",
      paidBy: { userId: USER.id, name: "Agustin" },
      splitMethod: "EQUAL",
      shares: [
        { userId: USER.id, name: "Agustin", amountOwedCents: 4201, percentBasisPoints: null },
        { userId: ORLANDO, name: "Orlando", amountOwedCents: 4200, percentBasisPoints: null },
      ],
      createdAt: "2026-09-29T17:30:00.000Z",
    });
  });

  it("stores the expense in the household from the URL, not the body", async () => {
    const agent = await signedInAgent();

    await agent
      .post(EXPENSES_URL)
      .send({ ...BODY, householdId: "clxSOMEONEELSES000000000" });

    expect(createWithShares).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: HOUSEHOLD_ID })
    );
  });

  it.each([
    ["VALIDATION_FAILED", { totalAmountCents: 0 }],
    ["NO_PARTICIPANTS", { participants: [] }],
    ["PAYER_NOT_MEMBER", { paidByUserId: "clxOUTSIDER0000000000000" }],
    ["PARTICIPANT_NOT_MEMBER", { participants: [{ userId: "clxOUTSIDER0000000000000" }] }],
    ["DUPLICATE_PARTICIPANT", { participants: [{ userId: ORLANDO }, { userId: ORLANDO }] }],
    [
      "SPLIT_SUM_MISMATCH",
      { splitMethod: "CUSTOM", participants: [{ userId: ORLANDO, amountCents: 1 }] },
    ],
    [
      "PERCENT_SUM_INVALID",
      { splitMethod: "PERCENTAGE", participants: [{ userId: ORLANDO, percentBasisPoints: 1 }] },
    ],
  ])("returns 400 %s and stores nothing", async (code, override) => {
    const agent = await signedInAgent();

    const res = await agent.post(EXPENSES_URL).send({ ...BODY, ...override });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
    expect(createWithShares).not.toHaveBeenCalled();
  });

  it("names the invalid fields in VALIDATION_FAILED", async () => {
    const agent = await signedInAgent();

    const res = await agent
      .post(EXPENSES_URL)
      .send({ ...BODY, description: "", totalAmountCents: "12.50" });

    expect(res.body.error.fields).toEqual({
      description: expect.any(String),
      totalAmountCents: expect.any(String),
    });
  });
});

describe("POST /api/households/:householdId/expenses/preview", () => {
  it("returns 200 with the calculated shares and stores nothing", async () => {
    const agent = await signedInAgent();

    const res = await agent.post(`${EXPENSES_URL}/preview`).send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.shares).toEqual([
      { userId: USER.id, name: "Agustin", amountOwedCents: 4201, percentBasisPoints: null },
      { userId: ORLANDO, name: "Orlando", amountOwedCents: 4200, percentBasisPoints: null },
    ]);
    expect(createWithShares).not.toHaveBeenCalled();
  });

  it("returns the same errors as create", async () => {
    const agent = await signedInAgent();

    const res = await agent
      .post(`${EXPENSES_URL}/preview`)
      .send({ ...BODY, participants: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_PARTICIPANTS");
  });
});

describe("GET /api/households/:householdId/expenses", () => {
  it("returns 200 with the household's expenses", async () => {
    listForHousehold.mockResolvedValue([STORED]);
    const agent = await signedInAgent();

    const res = await agent.get(EXPENSES_URL);

    expect(res.status).toBe(200);
    expect(listForHousehold).toHaveBeenCalledWith(HOUSEHOLD_ID);
    expect(res.body.expenses).toHaveLength(1);
    expect(res.body.expenses[0].id).toBe(STORED.id);
  });

  it("returns an empty list for a household with no expenses", async () => {
    listForHousehold.mockResolvedValue([]);
    const agent = await signedInAgent();

    const res = await agent.get(EXPENSES_URL);

    expect(res.status).toBe(200);
    expect(res.body.expenses).toEqual([]);
  });
});

describe("GET /api/households/:householdId/expenses/:expenseId", () => {
  it("returns 200 with the expense", async () => {
    findInHousehold.mockResolvedValue(STORED);
    const agent = await signedInAgent();

    const res = await agent.get(`${EXPENSES_URL}/${STORED.id}`);

    expect(res.status).toBe(200);
    expect(findInHousehold).toHaveBeenCalledWith(HOUSEHOLD_ID, STORED.id);
    expect(res.body.expense.id).toBe(STORED.id);
  });

  it("returns 404 EXPENSE_NOT_FOUND for an expense not in this household", async () => {
    findInHousehold.mockResolvedValue(null);
    const agent = await signedInAgent();

    const res = await agent.get(`${EXPENSES_URL}/clxELSEWHERE000000000000`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("EXPENSE_NOT_FOUND");
  });
});

describe("expense routes — authorization (FR-03, NFR-07)", () => {
  it("returns 401 without a session and stores nothing", async () => {
    const res = await request(app).post(EXPENSES_URL).send(BODY);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(createWithShares).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", "create"],
    ["POST", "preview"],
    ["GET", "list"],
    ["GET", "get"],
  ])("returns 404 HOUSEHOLD_NOT_FOUND to a non-member (%s %s)", async (method, which) => {
    findRole.mockResolvedValue(null);
    const agent = await signedInAgent();

    const url =
      which === "preview"
        ? `${EXPENSES_URL}/preview`
        : which === "get"
          ? `${EXPENSES_URL}/${STORED.id}`
          : EXPENSES_URL;
    const res =
      method === "POST" ? await agent.post(url).send(BODY) : await agent.get(url);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("HOUSEHOLD_NOT_FOUND");
    expect(listMembers).not.toHaveBeenCalled();
    expect(createWithShares).not.toHaveBeenCalled();
    expect(listForHousehold).not.toHaveBeenCalled();
    expect(findInHousehold).not.toHaveBeenCalled();
  });
});
