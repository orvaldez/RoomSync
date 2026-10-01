import { describe, it, expect, vi, beforeEach } from "vitest";

// Every repository is mocked, so these tests need no database.
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

import * as householdRepository from "../repositories/household.repository";
import * as ledgerRepository from "../repositories/ledger.repository";
import * as choreRepository from "../repositories/chore.repository";
import * as expenseRepository from "../repositories/expense.repository";
import { getDashboard, mergeActivity, RECENT_ACTIVITY_LIMIT } from "./dashboard.service";
import { HouseholdNotFoundError } from "./errors";
import type { PublicExpense } from "./expense.service";
import type { PublicSettlement } from "./settlement.service";
import type { PublicChore } from "./chore.service";

const findWithRole = vi.mocked(householdRepository.findWithRole);
const listMembers = vi.mocked(householdRepository.listMembers);
const findEntriesInvolving = vi.mocked(ledgerRepository.findEntriesInvolving);
const listSettlements = vi.mocked(ledgerRepository.listSettlements);
const listOpenAssignedTo = vi.mocked(choreRepository.listOpenAssignedTo);
const listCompleted = vi.mocked(choreRepository.listCompleted);
const listRecent = vi.mocked(expenseRepository.listRecent);

const HOUSEHOLD_ID = "clxHOUSEHOLD0000000000000";
const ME = "me";
const MAYA = "maya";

const at = (iso: string) => new Date(iso);

function expense(id: string, createdAt: string): PublicExpense {
  return {
    id,
    description: id,
    totalAmountCents: 1000,
    expenseDate: "2026-09-20",
    paidBy: { userId: ME, name: "Me" },
    splitMethod: "EQUAL",
    shares: [],
    createdAt: at(createdAt),
  };
}

function settlement(id: string, settledAt: string): PublicSettlement {
  return {
    id,
    from: { userId: MAYA, name: "Maya" },
    to: { userId: ME, name: "Me" },
    amountCents: 500,
    note: null,
    settledAt: at(settledAt),
  };
}

function completedChore(id: string, completedAt: string | null): PublicChore {
  return {
    id,
    title: id,
    description: null,
    assignee: null,
    dueDate: null,
    isComplete: completedAt !== null,
    completedAt: completedAt ? at(completedAt) : null,
    createdAt: at("2026-09-01T00:00:00Z"),
  };
}

describe("mergeActivity", () => {
  it("interleaves the three sources newest first", () => {
    const items = mergeActivity(
      [expense("e-old", "2026-09-20T10:00:00Z"), expense("e-new", "2026-09-28T10:00:00Z")],
      [settlement("s", "2026-09-25T10:00:00Z")],
      [completedChore("c", "2026-09-27T10:00:00Z")]
    );

    expect(items.map((item) => item.type)).toEqual([
      "EXPENSE",
      "CHORE_COMPLETED",
      "SETTLEMENT",
      "EXPENSE",
    ]);
    expect(items[0]).toMatchObject({ type: "EXPENSE", at: at("2026-09-28T10:00:00Z") });
    expect(items[0].type === "EXPENSE" && items[0].expense.id).toBe("e-new");
  });

  it("dates each item by when it happened: recorded, settled, completed", () => {
    const [e] = mergeActivity([expense("e", "2026-09-20T10:00:00Z")], [], []);
    const [s] = mergeActivity([], [settlement("s", "2026-09-21T10:00:00Z")], []);
    const [c] = mergeActivity([], [], [completedChore("c", "2026-09-22T10:00:00Z")]);

    expect(e.at).toEqual(at("2026-09-20T10:00:00Z"));
    expect(s.at).toEqual(at("2026-09-21T10:00:00Z"));
    expect(c.at).toEqual(at("2026-09-22T10:00:00Z"));
  });

  it("keeps at most the limit, dropping the oldest", () => {
    const expenses = Array.from({ length: 8 }, (_, i) =>
      expense(`e${i}`, `2026-09-${String(10 + i).padStart(2, "0")}T00:00:00Z`)
    );
    const settlements = Array.from({ length: 8 }, (_, i) =>
      settlement(`s${i}`, `2026-09-${String(10 + i).padStart(2, "0")}T12:00:00Z`)
    );

    const items = mergeActivity(expenses, settlements, []);

    expect(items).toHaveLength(RECENT_ACTIVITY_LIMIT);
    expect(RECENT_ACTIVITY_LIMIT).toBe(10);
    // Newest is the last settlement (17th, noon); the oldest kept is the
    // expense on the 13th, so the 10th-12th of both fall off.
    expect(items[0].type === "SETTLEMENT" && items[0].settlement.id).toBe("s7");
    expect(items.at(-1)?.at).toEqual(at("2026-09-13T00:00:00Z"));
  });

  it("is stable for simultaneous items, keeping input order", () => {
    const same = "2026-09-20T10:00:00Z";
    const items = mergeActivity([expense("e", same)], [settlement("s", same)], [completedChore("c", same)]);

    expect(items.map((item) => item.type)).toEqual(["EXPENSE", "SETTLEMENT", "CHORE_COMPLETED"]);
  });

  it("skips a chore with no completion time rather than dating it", () => {
    expect(mergeActivity([], [], [completedChore("c", null)])).toEqual([]);
  });

  it("is empty for a household with no activity (UC-10 6a)", () => {
    expect(mergeActivity([], [], [])).toEqual([]);
  });
});

describe("getDashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    findWithRole.mockResolvedValue({
      id: HOUSEHOLD_ID,
      name: "Apartment 4B",
      createdAt: at("2026-09-01T00:00:00Z"),
      role: "OWNER",
    });
    listMembers.mockResolvedValue([
      { userId: ME, name: "Me", role: "OWNER", joinedAt: at("2026-09-01T00:00:00Z") },
      { userId: MAYA, name: "Maya", role: "MEMBER", joinedAt: at("2026-09-02T00:00:00Z") },
    ]);
    findEntriesInvolving.mockResolvedValue({
      debts: [{ debtorId: MAYA, creditorId: ME, amountCents: 2500 }],
      payments: [],
    });
    listOpenAssignedTo.mockResolvedValue([]);
    listRecent.mockResolvedValue([]);
    listSettlements.mockResolvedValue([]);
    listCompleted.mockResolvedValue([]);
  });

  it("returns the household with the requester's role and every member", async () => {
    const dashboard = await getDashboard(HOUSEHOLD_ID, ME);

    expect(findWithRole).toHaveBeenCalledWith(ME, HOUSEHOLD_ID);
    expect(dashboard.household).toEqual({
      id: HOUSEHOLD_ID,
      name: "Apartment 4B",
      createdAt: at("2026-09-01T00:00:00Z"),
      role: "OWNER",
    });
    expect(dashboard.members.map((m) => m.userId)).toEqual([ME, MAYA]);
  });

  it("derives the requester's balances, the same as the Balances screen (UC-07)", async () => {
    const dashboard = await getDashboard(HOUSEHOLD_ID, ME);

    expect(findEntriesInvolving).toHaveBeenCalledWith(HOUSEHOLD_ID, ME);
    expect(dashboard.balances).toEqual({
      balances: [{ userId: MAYA, name: "Maya", netCents: 2500 }],
      totals: { youOweCents: 0, owedToYouCents: 2500 },
    });
  });

  it("shows a zero balance rather than nothing for a quiet household (UC-10 4a)", async () => {
    findEntriesInvolving.mockResolvedValue({ debts: [], payments: [] });

    const dashboard = await getDashboard(HOUSEHOLD_ID, ME);

    expect(dashboard.balances.balances).toEqual([{ userId: MAYA, name: "Maya", netCents: 0 }]);
  });

  it("lists only open chores assigned to the requester (UC-10 step 5)", async () => {
    listOpenAssignedTo.mockResolvedValue([
      {
        id: "chore-1",
        householdId: HOUSEHOLD_ID,
        title: "Take out trash",
        description: null,
        assignee: { userId: ME, name: "Me" },
        dueDate: at("2026-10-02T00:00:00Z"),
        isComplete: false,
        completedAt: null,
        createdAt: at("2026-09-25T00:00:00Z"),
      },
    ]);

    const dashboard = await getDashboard(HOUSEHOLD_ID, ME);

    expect(listOpenAssignedTo).toHaveBeenCalledWith(HOUSEHOLD_ID, ME);
    expect(dashboard.upcomingChores).toHaveLength(1);
    expect(dashboard.upcomingChores[0]).toMatchObject({ id: "chore-1", dueDate: "2026-10-02" });
  });

  it("reads at most the limit from each activity source (NFR-02)", async () => {
    await getDashboard(HOUSEHOLD_ID, ME);

    expect(listRecent).toHaveBeenCalledWith(HOUSEHOLD_ID, RECENT_ACTIVITY_LIMIT);
    expect(listSettlements).toHaveBeenCalledWith(HOUSEHOLD_ID, RECENT_ACTIVITY_LIMIT);
    expect(listCompleted).toHaveBeenCalledWith(HOUSEHOLD_ID, RECENT_ACTIVITY_LIMIT);
  });

  it("returns empty arrays for an empty household (UC-10 5a, 6a)", async () => {
    const dashboard = await getDashboard(HOUSEHOLD_ID, ME);

    expect(dashboard.upcomingChores).toEqual([]);
    expect(dashboard.recentActivity).toEqual([]);
  });

  it("rejects with HOUSEHOLD_NOT_FOUND when the requester is not a member", async () => {
    findWithRole.mockResolvedValue(null);

    await expect(getDashboard(HOUSEHOLD_ID, "stranger")).rejects.toBeInstanceOf(
      HouseholdNotFoundError
    );
  });
});
