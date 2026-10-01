import { describe, it, expect } from "vitest";
import type { ActivityItem, Chore, Expense, Settlement } from "./api";
import { describeActivity, formatActivityDate, summarizeBalances } from "./activity";

const ME = "me";

function expenseItem(paidBy: { userId: string; name: string }): ActivityItem {
  const expense: Expense = {
    id: "e1",
    description: "Groceries",
    totalAmountCents: 8451,
    expenseDate: "2026-09-24",
    paidBy,
    splitMethod: "EQUAL",
    shares: [],
    createdAt: "2026-09-24T18:00:00.000Z",
  };
  return { type: "EXPENSE", at: expense.createdAt, expense };
}

function settlementItem(from: string, to: string): ActivityItem {
  const name = (id: string) => (id === ME ? "Agustin" : id === "maya" ? "Maya" : "Sam");
  const settlement: Settlement = {
    id: "s1",
    from: { userId: from, name: name(from) },
    to: { userId: to, name: name(to) },
    amountCents: 1833,
    note: null,
    settledAt: "2026-09-25T18:00:00.000Z",
  };
  return { type: "SETTLEMENT", at: settlement.settledAt, settlement };
}

function choreItem(assignee: { userId: string; name: string } | null): ActivityItem {
  const chore: Chore = {
    id: "c1",
    title: "Take out trash",
    description: null,
    assignee,
    dueDate: null,
    isComplete: true,
    completedAt: "2026-09-26T18:00:00.000Z",
    createdAt: "2026-09-20T18:00:00.000Z",
  };
  return { type: "CHORE_COMPLETED", at: "2026-09-26T18:00:00.000Z", chore };
}

describe("describeActivity", () => {
  it("names the payer of an expense, with its total", () => {
    expect(describeActivity(expenseItem({ userId: "maya", name: "Maya" }), ME)).toBe(
      'Maya added "Groceries" · $84.51'
    );
  });

  it("says You when the reader paid", () => {
    expect(describeActivity(expenseItem({ userId: ME, name: "Agustin" }), ME)).toBe(
      'You added "Groceries" · $84.51'
    );
  });

  it("describes a settlement from the reader's side", () => {
    expect(describeActivity(settlementItem("maya", ME), ME)).toBe("Maya paid you $18.33");
    expect(describeActivity(settlementItem(ME, "maya"), ME)).toBe("You paid Maya $18.33");
    expect(describeActivity(settlementItem("maya", "sam"), ME)).toBe("Maya paid Sam $18.33");
  });

  it("credits a completed chore to its assignee", () => {
    expect(describeActivity(choreItem({ userId: "sam", name: "Sam" }), ME)).toBe(
      'Sam completed "Take out trash"'
    );
    expect(describeActivity(choreItem({ userId: ME, name: "Agustin" }), ME)).toBe(
      'You completed "Take out trash"'
    );
  });

  it("does not guess who completed an unassigned chore", () => {
    expect(describeActivity(choreItem(null), ME)).toBe('"Take out trash" was completed');
  });
});

describe("formatActivityDate", () => {
  it("shows a short month and day", () => {
    // Midday UTC, so the date is the same in every time zone the test runs in.
    expect(formatActivityDate("2026-09-28T12:00:00.000Z")).toMatch(/Sep\s28/);
  });
});

describe("summarizeBalances", () => {
  const totals = (youOweCents: number, owedToYouCents: number) => ({
    balances: [],
    totals: { youOweCents, owedToYouCents },
  });

  it("says settled up when nothing is owed either way (UC-10 4a)", () => {
    expect(summarizeBalances(totals(0, 0))).toBe("You are all settled up.");
  });

  it("names what you owe", () => {
    expect(summarizeBalances(totals(1250, 0))).toBe("You owe $12.50.");
  });

  it("names what you are owed", () => {
    expect(summarizeBalances(totals(0, 4201))).toBe("You are owed $42.01.");
  });

  it("names both directions rather than netting them", () => {
    expect(summarizeBalances(totals(1500, 2000))).toBe("You owe $15.00 and you are owed $20.00.");
  });
});
