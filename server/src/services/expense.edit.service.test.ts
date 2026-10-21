import { describe, it, expect, vi, beforeEach } from "vitest";

// As in expense.service.test.ts: repositories mocked, so no database.
vi.mock("../repositories/expense.repository", () => ({
  createWithShares: vi.fn(),
  listForHousehold: vi.fn(),
  findInHousehold: vi.fn(),
  replaceWithShares: vi.fn(),
  softDelete: vi.fn(),
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
  canChangeExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
  type ExpenseInput,
  type Requester,
} from "./expense.service";
import {
  ExpenseDeletedError,
  ExpenseNotFoundError,
  NotExpenseEditorError,
  SplitSumMismatchError,
} from "./errors";

/**
 * US-12: editing and deleting an expense (analysis-model.md §8.1). The
 * arithmetic itself is the same split create uses, tested in
 * split.service.test.ts; these tests cover who may change an expense, the
 * order the checks run in, and what reaches the repository.
 */

const findInHousehold = vi.mocked(expenseRepository.findInHousehold);
const replaceWithShares = vi.mocked(expenseRepository.replaceWithShares);
const softDelete = vi.mocked(expenseRepository.softDelete);
const listForHousehold = vi.mocked(expenseRepository.listForHousehold);
const listMembers = vi.mocked(householdRepository.listMembers);

const HOUSEHOLD_ID = "clxHOUSEHOLD0000000000000";
const EXPENSE_ID = "clxEXPENSE00000000000000";
const AGUSTIN = "clxAGUSTIN00000000000000";
const ORLANDO = "clxORLANDO00000000000000";
const MAYA = "clxMAYA000000000000000000";

const MEMBERS = [
  { userId: AGUSTIN, name: "Agustin", role: "OWNER" as const, joinedAt: new Date("2026-09-01") },
  { userId: ORLANDO, name: "Orlando", role: "MEMBER" as const, joinedAt: new Date("2026-09-02") },
  { userId: MAYA, name: "Maya", role: "MEMBER" as const, joinedAt: new Date("2026-09-03") },
];

const OWNER: Requester = { userId: AGUSTIN, role: "OWNER" };
const PAYER: Requester = { userId: ORLANDO, role: "MEMBER" };
const OTHER_MEMBER: Requester = { userId: MAYA, role: "MEMBER" };

/** Orlando's $90 internet bill, split equally three ways: 3000 each. */
function stored(
  overrides: Partial<expenseRepository.ExpenseRecord> = {}
): expenseRepository.ExpenseRecord {
  return {
    id: EXPENSE_ID,
    householdId: HOUSEHOLD_ID,
    description: "Internet",
    totalAmountCents: 9000,
    expenseDate: new Date("2026-10-01T00:00:00.000Z"),
    paidBy: { userId: ORLANDO, name: "Orlando" },
    splitMethod: "EQUAL",
    shares: [
      { userId: AGUSTIN, name: "Agustin", amountOwedCents: 3000, percentBasisPoints: null },
      { userId: ORLANDO, name: "Orlando", amountOwedCents: 3000, percentBasisPoints: null },
      { userId: MAYA, name: "Maya", amountOwedCents: 3000, percentBasisPoints: null },
    ],
    createdAt: new Date("2026-10-01T18:00:00.000Z"),
    updatedAt: new Date("2026-10-01T18:00:00.000Z"),
    deleted: null,
    ...overrides,
  };
}

/** The corrected bill: $100.00, not $90.00. */
function corrected(overrides: ExpenseInput = {}): ExpenseInput {
  return {
    description: "Internet",
    totalAmountCents: 10000,
    expenseDate: "2026-10-01",
    paidByUserId: ORLANDO,
    splitMethod: "EQUAL",
    participants: [{ userId: AGUSTIN }, { userId: ORLANDO }, { userId: MAYA }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  listMembers.mockResolvedValue(MEMBERS);
  findInHousehold.mockResolvedValue(stored());
  replaceWithShares.mockImplementation(async (_id, expense) => ({
    status: "updated",
    expense: stored({
      totalAmountCents: expense.totalAmountCents,
      shares: expense.shares.map((share) => ({
        ...share,
        name: MEMBERS.find((m) => m.userId === share.userId)?.name ?? "",
      })),
      updatedAt: new Date("2026-10-21T12:00:00.000Z"),
    }),
  }));
});

describe("canChangeExpense — who may edit or delete (§8.1, decision 1)", () => {
  it("allows the member who paid", () => {
    expect(canChangeExpense(stored(), PAYER)).toBe(true);
  });

  it("allows the household owner, for anyone's expense", () => {
    expect(canChangeExpense(stored(), OWNER)).toBe(true);
  });

  it("refuses any other member", () => {
    expect(canChangeExpense(stored(), OTHER_MEMBER)).toBe(false);
  });
});

describe("updateExpense", () => {
  it("recalculates the split and stores the corrected expense", async () => {
    const expense = await updateExpense(HOUSEHOLD_ID, EXPENSE_ID, PAYER, corrected());

    // $100.00 three ways: 3334, 3333, 3333, the extra cent to the first.
    expect(replaceWithShares).toHaveBeenCalledWith(EXPENSE_ID, {
      householdId: HOUSEHOLD_ID,
      description: "Internet",
      totalAmountCents: 10000,
      expenseDate: new Date("2026-10-01T00:00:00.000Z"),
      paidByUserId: ORLANDO,
      splitMethod: "EQUAL",
      shares: [
        { userId: AGUSTIN, amountOwedCents: 3334, percentBasisPoints: null },
        { userId: ORLANDO, amountOwedCents: 3333, percentBasisPoints: null },
        { userId: MAYA, amountOwedCents: 3333, percentBasisPoints: null },
      ],
    });
    expect(expense.totalAmountCents).toBe(10000);
    expect(expense.updatedAt).toEqual(new Date("2026-10-21T12:00:00.000Z"));
    expect(expense.deleted).toBeNull();
  });

  it("lets the owner correct a roommate's expense", async () => {
    await updateExpense(HOUSEHOLD_ID, EXPENSE_ID, OWNER, corrected());
    expect(replaceWithShares).toHaveBeenCalledTimes(1);
  });

  it("refuses another member before validating anything", async () => {
    const error = await updateExpense(HOUSEHOLD_ID, EXPENSE_ID, OTHER_MEMBER, corrected()).catch(
      (e) => e
    );

    expect(error).toBeInstanceOf(NotExpenseEditorError);
    expect(error).toMatchObject({ code: "NOT_EXPENSE_EDITOR", status: 403 });
    expect(listMembers).not.toHaveBeenCalled();
    expect(replaceWithShares).not.toHaveBeenCalled();
  });

  it("checks the payer before the edit, so a member can't make themselves the payer", async () => {
    const error = await updateExpense(
      HOUSEHOLD_ID,
      EXPENSE_ID,
      OTHER_MEMBER,
      corrected({ paidByUserId: MAYA })
    ).catch((e) => e);

    expect(error).toBeInstanceOf(NotExpenseEditorError);
    expect(replaceWithShares).not.toHaveBeenCalled();
  });

  it("returns EXPENSE_NOT_FOUND for an expense not in this household", async () => {
    findInHousehold.mockResolvedValue(null);

    const error = await updateExpense(HOUSEHOLD_ID, EXPENSE_ID, OWNER, corrected()).catch(
      (e) => e
    );

    expect(error).toBeInstanceOf(ExpenseNotFoundError);
    expect(replaceWithShares).not.toHaveBeenCalled();
  });

  it("refuses to edit a deleted expense", async () => {
    findInHousehold.mockResolvedValue(
      stored({
        deleted: { at: new Date("2026-10-20T00:00:00Z"), by: { userId: ORLANDO, name: "Orlando" } },
      })
    );

    const error = await updateExpense(HOUSEHOLD_ID, EXPENSE_ID, PAYER, corrected()).catch(
      (e) => e
    );

    expect(error).toBeInstanceOf(ExpenseDeletedError);
    expect(error).toMatchObject({ code: "EXPENSE_DELETED", status: 409 });
    expect(replaceWithShares).not.toHaveBeenCalled();
  });

  it("runs the same split validation as create, and writes nothing on failure", async () => {
    const error = await updateExpense(
      HOUSEHOLD_ID,
      EXPENSE_ID,
      PAYER,
      corrected({
        splitMethod: "CUSTOM",
        participants: [
          { userId: ORLANDO, amountCents: 5000 },
          { userId: MAYA, amountCents: 4999 },
        ],
      })
    ).catch((e) => e);

    expect(error).toBeInstanceOf(SplitSumMismatchError);
    expect(replaceWithShares).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", ExpenseNotFoundError],
    ["deleted", ExpenseDeletedError],
  ] as const)(
    "reports a %s found under the ledger lock, when a delete landed first",
    async (status, ErrorClass) => {
      replaceWithShares.mockResolvedValue({ status });

      const error = await updateExpense(HOUSEHOLD_ID, EXPENSE_ID, PAYER, corrected()).catch(
        (e) => e
      );

      expect(error).toBeInstanceOf(ErrorClass);
    }
  );
});

describe("deleteExpense", () => {
  it("soft-deletes the expense, recording who deleted it", async () => {
    await deleteExpense(HOUSEHOLD_ID, EXPENSE_ID, PAYER);
    expect(softDelete).toHaveBeenCalledWith(HOUSEHOLD_ID, EXPENSE_ID, ORLANDO);
  });

  it("lets the owner delete a roommate's expense", async () => {
    await deleteExpense(HOUSEHOLD_ID, EXPENSE_ID, OWNER);
    expect(softDelete).toHaveBeenCalledWith(HOUSEHOLD_ID, EXPENSE_ID, AGUSTIN);
  });

  it("refuses another member", async () => {
    const error = await deleteExpense(HOUSEHOLD_ID, EXPENSE_ID, OTHER_MEMBER).catch((e) => e);

    expect(error).toBeInstanceOf(NotExpenseEditorError);
    expect(softDelete).not.toHaveBeenCalled();
  });

  it("returns EXPENSE_NOT_FOUND for an expense not in this household", async () => {
    findInHousehold.mockResolvedValue(null);

    const error = await deleteExpense(HOUSEHOLD_ID, EXPENSE_ID, OWNER).catch((e) => e);

    expect(error).toBeInstanceOf(ExpenseNotFoundError);
    expect(softDelete).not.toHaveBeenCalled();
  });

  it("succeeds without writing when it is already deleted, keeping the first delete", async () => {
    findInHousehold.mockResolvedValue(
      stored({
        deleted: { at: new Date("2026-10-20T00:00:00Z"), by: { userId: AGUSTIN, name: "Agustin" } },
      })
    );

    await expect(deleteExpense(HOUSEHOLD_ID, EXPENSE_ID, PAYER)).resolves.toBeUndefined();
    expect(softDelete).not.toHaveBeenCalled();
  });
});

describe("listExpenses", () => {
  it("leaves deleted expenses out by default", async () => {
    listForHousehold.mockResolvedValue([]);
    await listExpenses(HOUSEHOLD_ID);
    expect(listForHousehold).toHaveBeenCalledWith(HOUSEHOLD_ID, { includeDeleted: false });
  });

  it("includes them when the History screen asks", async () => {
    listForHousehold.mockResolvedValue([]);
    await listExpenses(HOUSEHOLD_ID, { includeDeleted: true });
    expect(listForHousehold).toHaveBeenCalledWith(HOUSEHOLD_ID, { includeDeleted: true });
  });
});
