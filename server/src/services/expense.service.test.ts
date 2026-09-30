import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked before importing the service, so the real repositories — and through
// them the Prisma client — are never loaded. These tests need no database.
vi.mock("../repositories/expense.repository", () => ({
  createWithShares: vi.fn(),
  listForHousehold: vi.fn(),
  findInHousehold: vi.fn(),
}));

vi.mock("../repositories/household.repository", () => ({
  createWithOwner: vi.fn(),
  findCurrentForUser: vi.fn(),
  hasMembership: vi.fn(),
  findRole: vi.fn(),
  listMembers: vi.fn(),
}));

import * as expenseRepository from "../repositories/expense.repository";
import * as householdRepository from "../repositories/household.repository";
import {
  createExpense,
  getExpense,
  listExpenses,
  previewExpense,
  type ExpenseInput,
} from "./expense.service";
import {
  DuplicateParticipantError,
  ExpenseNotFoundError,
  NoParticipantsError,
  ParticipantNotMemberError,
  PayerNotMemberError,
  PercentSumInvalidError,
  SplitSumMismatchError,
  ValidationError,
} from "./errors";

const createWithShares = vi.mocked(expenseRepository.createWithShares);
const listForHousehold = vi.mocked(expenseRepository.listForHousehold);
const findInHousehold = vi.mocked(expenseRepository.findInHousehold);
const listMembers = vi.mocked(householdRepository.listMembers);

const HOUSEHOLD_ID = "clxHOUSEHOLD0000000000000";
const AGUSTIN = "clxAGUSTIN00000000000000";
const ORLANDO = "clxORLANDO00000000000000";
const MAYA = "clxMAYA000000000000000000";
const OUTSIDER = "clxOUTSIDER0000000000000";

const MEMBERS = [
  { userId: AGUSTIN, name: "Agustin", role: "OWNER" as const, joinedAt: new Date("2026-09-01") },
  { userId: ORLANDO, name: "Orlando", role: "MEMBER" as const, joinedAt: new Date("2026-09-02") },
  { userId: MAYA, name: "Maya", role: "MEMBER" as const, joinedAt: new Date("2026-09-03") },
];

/** A valid $100 groceries expense split three ways; override what a test varies. */
function groceries(overrides: ExpenseInput = {}): ExpenseInput {
  return {
    description: "Groceries",
    totalAmountCents: 10000,
    expenseDate: "2026-09-29",
    paidByUserId: AGUSTIN,
    splitMethod: "EQUAL",
    participants: [{ userId: AGUSTIN }, { userId: ORLANDO }, { userId: MAYA }],
    ...overrides,
  };
}

/** Echo back what the repository was asked to store, as the database would. */
function stored(
  overrides: Partial<expenseRepository.ExpenseRecord> = {}
): expenseRepository.ExpenseRecord {
  return {
    id: "clxEXPENSE00000000000000",
    householdId: HOUSEHOLD_ID,
    description: "Groceries",
    totalAmountCents: 10000,
    expenseDate: new Date("2026-09-29T00:00:00.000Z"),
    paidBy: { userId: AGUSTIN, name: "Agustin" },
    splitMethod: "EQUAL",
    shares: [
      { userId: AGUSTIN, name: "Agustin", amountOwedCents: 3334, percentBasisPoints: null },
      { userId: ORLANDO, name: "Orlando", amountOwedCents: 3333, percentBasisPoints: null },
      { userId: MAYA, name: "Maya", amountOwedCents: 3333, percentBasisPoints: null },
    ],
    createdAt: new Date("2026-09-29T17:30:00.000Z"),
    ...overrides,
  };
}

/** Runs `fn` and returns what it rejected with, so a test can inspect it. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to reject, but it resolved.");
}

beforeEach(() => {
  vi.resetAllMocks();
  listMembers.mockResolvedValue(MEMBERS);
  createWithShares.mockResolvedValue(stored());
});

describe("createExpense — main success scenario (UC-05)", () => {
  it("stores the expense with its calculated shares", async () => {
    await createExpense(HOUSEHOLD_ID, groceries());

    expect(createWithShares).toHaveBeenCalledWith({
      householdId: HOUSEHOLD_ID,
      description: "Groceries",
      totalAmountCents: 10000,
      expenseDate: new Date("2026-09-29T00:00:00.000Z"),
      paidByUserId: AGUSTIN,
      splitMethod: "EQUAL",
      shares: [
        { userId: AGUSTIN, amountOwedCents: 3334, percentBasisPoints: null },
        { userId: ORLANDO, amountOwedCents: 3333, percentBasisPoints: null },
        { userId: MAYA, amountOwedCents: 3333, percentBasisPoints: null },
      ],
    });
  });

  it("returns the expense in the contract's ExpensePublic shape", async () => {
    const expense = await createExpense(HOUSEHOLD_ID, groceries());

    expect(expense).toEqual({
      id: "clxEXPENSE00000000000000",
      description: "Groceries",
      totalAmountCents: 10000,
      expenseDate: "2026-09-29",
      paidBy: { userId: AGUSTIN, name: "Agustin" },
      splitMethod: "EQUAL",
      shares: [
        { userId: AGUSTIN, name: "Agustin", amountOwedCents: 3334, percentBasisPoints: null },
        { userId: ORLANDO, name: "Orlando", amountOwedCents: 3333, percentBasisPoints: null },
        { userId: MAYA, name: "Maya", amountOwedCents: 3333, percentBasisPoints: null },
      ],
      createdAt: new Date("2026-09-29T17:30:00.000Z"),
    });
  });

  it("trims the description before storing it", async () => {
    await createExpense(HOUSEHOLD_ID, groceries({ description: "  Groceries  " }));

    expect(createWithShares).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Groceries" })
    );
  });

  it("lets any member be the payer, not only the requester", async () => {
    await createExpense(HOUSEHOLD_ID, groceries({ paidByUserId: MAYA }));

    expect(createWithShares).toHaveBeenCalledWith(
      expect.objectContaining({ paidByUserId: MAYA })
    );
  });

  it("lets the payer be left out of the split", async () => {
    await createExpense(
      HOUSEHOLD_ID,
      groceries({ participants: [{ userId: ORLANDO }, { userId: MAYA }] })
    );

    const { shares } = createWithShares.mock.calls[0][0];
    expect(shares.map((s) => s.userId)).toEqual([ORLANDO, MAYA]);
  });

  it("stores custom amounts as given", async () => {
    await createExpense(
      HOUSEHOLD_ID,
      groceries({
        splitMethod: "CUSTOM",
        participants: [
          { userId: AGUSTIN, amountCents: 7000 },
          { userId: ORLANDO, amountCents: 3000 },
        ],
      })
    );

    const { shares, splitMethod } = createWithShares.mock.calls[0][0];
    expect(splitMethod).toBe("CUSTOM");
    expect(shares.map((s) => s.amountOwedCents)).toEqual([7000, 3000]);
  });

  it("stores percentages alongside the amounts they produced", async () => {
    await createExpense(
      HOUSEHOLD_ID,
      groceries({
        splitMethod: "PERCENTAGE",
        participants: [
          { userId: AGUSTIN, percentBasisPoints: 6000 },
          { userId: ORLANDO, percentBasisPoints: 4000 },
        ],
      })
    );

    expect(createWithShares.mock.calls[0][0].shares).toEqual([
      { userId: AGUSTIN, amountOwedCents: 6000, percentBasisPoints: 6000 },
      { userId: ORLANDO, amountOwedCents: 4000, percentBasisPoints: 4000 },
    ]);
  });
});

describe("createExpense — invalid fields (UC-05 2a-2c)", () => {
  it.each([
    ["zero", 0],
    ["negative", -500],
    ["not a number", "ten dollars"],
    ["fractional cents", 12.345],
    ["missing", undefined],
  ])("rejects an amount that is %s", async (_label, totalAmountCents) => {
    const error = await rejectionOf(
      createExpense(HOUSEHOLD_ID, groceries({ totalAmountCents }))
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toHaveProperty("totalAmountCents");
  });

  it.each([
    ["missing", undefined],
    ["blank", "   "],
    ["over 200 characters", "x".repeat(201)],
  ])("rejects a description that is %s", async (_label, description) => {
    const error = await rejectionOf(
      createExpense(HOUSEHOLD_ID, groceries({ description }))
    );

    expect((error as ValidationError).fields).toHaveProperty("description");
  });

  it.each([
    ["missing", undefined],
    ["in another format", "09/29/2026"],
    ["not a real day", "2026-02-30"],
  ])("rejects a date that is %s", async (_label, expenseDate) => {
    const error = await rejectionOf(
      createExpense(HOUSEHOLD_ID, groceries({ expenseDate }))
    );

    expect((error as ValidationError).fields).toHaveProperty("expenseDate");
  });

  it("rejects an unknown split method", async () => {
    const error = await rejectionOf(
      createExpense(HOUSEHOLD_ID, groceries({ splitMethod: "WHOEVER" }))
    );

    expect((error as ValidationError).fields).toHaveProperty("splitMethod");
  });

  it("reports every invalid field in one error", async () => {
    const error = await rejectionOf(
      createExpense(HOUSEHOLD_ID, {
        description: "",
        totalAmountCents: -1,
        expenseDate: "yesterday",
        paidByUserId: AGUSTIN,
        splitMethod: "EQUAL",
        participants: "everyone",
      })
    );

    expect(Object.keys((error as ValidationError).fields).sort()).toEqual([
      "description",
      "expenseDate",
      "participants",
      "totalAmountCents",
    ]);
  });

  it("does not look up members when a field is invalid", async () => {
    await rejectionOf(createExpense(HOUSEHOLD_ID, groceries({ totalAmountCents: 0 })));

    expect(listMembers).not.toHaveBeenCalled();
  });
});

describe("createExpense — membership (UC-05 3a)", () => {
  it("rejects a payer from outside the household", async () => {
    await expect(
      createExpense(HOUSEHOLD_ID, groceries({ paidByUserId: OUTSIDER }))
    ).rejects.toThrow(PayerNotMemberError);
  });

  it("rejects a missing payer as not a member", async () => {
    await expect(
      createExpense(HOUSEHOLD_ID, groceries({ paidByUserId: undefined }))
    ).rejects.toThrow(PayerNotMemberError);
  });

  it("rejects a participant from outside the household", async () => {
    await expect(
      createExpense(
        HOUSEHOLD_ID,
        groceries({ participants: [{ userId: AGUSTIN }, { userId: OUTSIDER }] })
      )
    ).rejects.toThrow(ParticipantNotMemberError);
  });

  it("checks membership against the household it was given", async () => {
    await createExpense(HOUSEHOLD_ID, groceries());

    expect(listMembers).toHaveBeenCalledWith(HOUSEHOLD_ID);
  });
});

describe("createExpense — invalid splits are never saved (UC-05 9a)", () => {
  it.each([
    ["no participants", groceries({ participants: [] }), NoParticipantsError],
    [
      "a duplicate participant",
      groceries({ participants: [{ userId: AGUSTIN }, { userId: AGUSTIN }] }),
      DuplicateParticipantError,
    ],
    [
      "custom amounts that do not add up",
      groceries({
        splitMethod: "CUSTOM",
        participants: [
          { userId: AGUSTIN, amountCents: 5000 },
          { userId: ORLANDO, amountCents: 4999 },
        ],
      }),
      SplitSumMismatchError,
    ],
    [
      "percentages that do not add up to 100",
      groceries({
        splitMethod: "PERCENTAGE",
        participants: [
          { userId: AGUSTIN, percentBasisPoints: 5000 },
          { userId: ORLANDO, percentBasisPoints: 4000 },
        ],
      }),
      PercentSumInvalidError,
    ],
    [
      "a negative custom amount",
      groceries({
        splitMethod: "CUSTOM",
        participants: [
          { userId: AGUSTIN, amountCents: 11000 },
          { userId: ORLANDO, amountCents: -1000 },
        ],
      }),
      ValidationError,
    ],
    [
      "a non-member participant",
      groceries({ participants: [{ userId: OUTSIDER }] }),
      ParticipantNotMemberError,
    ],
  ])("rejects %s and writes nothing", async (_label, input, errorClass) => {
    await expect(createExpense(HOUSEHOLD_ID, input)).rejects.toThrow(errorClass);

    expect(createWithShares).not.toHaveBeenCalled();
  });
});

describe("previewExpense", () => {
  it("returns the calculated shares with names", async () => {
    const shares = await previewExpense(HOUSEHOLD_ID, groceries());

    expect(shares).toEqual([
      { userId: AGUSTIN, name: "Agustin", amountOwedCents: 3334, percentBasisPoints: null },
      { userId: ORLANDO, name: "Orlando", amountOwedCents: 3333, percentBasisPoints: null },
      { userId: MAYA, name: "Maya", amountOwedCents: 3333, percentBasisPoints: null },
    ]);
  });

  it("writes nothing", async () => {
    await previewExpense(HOUSEHOLD_ID, groceries());

    expect(createWithShares).not.toHaveBeenCalled();
  });

  it("rejects exactly what create rejects", async () => {
    await expect(
      previewExpense(HOUSEHOLD_ID, groceries({ paidByUserId: OUTSIDER }))
    ).rejects.toThrow(PayerNotMemberError);
  });
});

describe("listExpenses and getExpense", () => {
  it("lists the household's expenses in the contract's shape", async () => {
    listForHousehold.mockResolvedValue([stored()]);

    const expenses = await listExpenses(HOUSEHOLD_ID);

    expect(listForHousehold).toHaveBeenCalledWith(HOUSEHOLD_ID);
    expect(expenses).toHaveLength(1);
    expect(expenses[0].expenseDate).toBe("2026-09-29");
  });

  it("returns an expense that belongs to the household", async () => {
    findInHousehold.mockResolvedValue(stored());

    const expense = await getExpense(HOUSEHOLD_ID, "clxEXPENSE00000000000000");

    expect(findInHousehold).toHaveBeenCalledWith(HOUSEHOLD_ID, "clxEXPENSE00000000000000");
    expect(expense.id).toBe("clxEXPENSE00000000000000");
  });

  it("returns EXPENSE_NOT_FOUND when the household has no such expense", async () => {
    findInHousehold.mockResolvedValue(null);

    const error = await rejectionOf(getExpense(HOUSEHOLD_ID, "clxNOPE"));

    expect(error).toBeInstanceOf(ExpenseNotFoundError);
    expect(error).toMatchObject({ code: "EXPENSE_NOT_FOUND", status: 404 });
  });
});
