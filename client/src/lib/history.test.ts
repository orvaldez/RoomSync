import { describe, it, expect } from "vitest";
import type { Chore, Expense } from "./api";
import {
  describeCompletedChore,
  describePayment,
  describeSplit,
  formatLongDate,
  shareRows,
} from "./history";

const AGUSTIN = "user-agustin";
const ORLANDO = "user-orlando";
const MAYA = "user-maya";

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    description: "Groceries",
    totalAmountCents: 10000,
    expenseDate: "2026-09-30",
    paidBy: { userId: AGUSTIN, name: "Agustin" },
    splitMethod: "EQUAL",
    shares: [
      { userId: AGUSTIN, name: "Agustin", amountOwedCents: 3334, percentBasisPoints: null },
      { userId: ORLANDO, name: "Orlando", amountOwedCents: 3333, percentBasisPoints: null },
      { userId: MAYA, name: "Maya", amountOwedCents: 3333, percentBasisPoints: null },
    ],
    createdAt: "2026-09-30T18:00:00Z",
    ...overrides,
  };
}

function chore(overrides: Partial<Chore> = {}): Chore {
  return {
    id: "chore-1",
    title: "Take out the trash",
    description: null,
    assignee: { userId: MAYA, name: "Maya" },
    dueDate: null,
    isComplete: true,
    completedAt: "2026-10-09T15:00:00Z",
    createdAt: "2026-10-01T15:00:00Z",
    ...overrides,
  };
}

describe("describeSplit", () => {
  it.each([
    ["EQUAL", "Split equally between 3 people"],
    ["CUSTOM", "Split by amount between 3 people"],
    ["PERCENTAGE", "Split by percentage between 3 people"],
  ] as const)("names a %s split", (splitMethod, text) => {
    expect(describeSplit(expense({ splitMethod }))).toBe(text);
  });

  it("names the one person when nobody else shares it", () => {
    const solo = expense({ shares: [expense().shares[1]] });
    expect(describeSplit(solo)).toBe("Charged to Orlando alone");
  });
});

describe("formatLongDate", () => {
  it("spells out the weekday and month", () => {
    expect(formatLongDate("2026-09-30")).toBe("Wednesday, September 30");
  });

  it("does not shift the day by time zone", () => {
    expect(formatLongDate("2026-01-01")).toBe("Thursday, January 1");
  });
});

describe("describePayment", () => {
  it("names the payer and the date", () => {
    expect(describePayment(expense(), ORLANDO)).toBe(
      "Paid by Agustin on Wednesday, September 30"
    );
  });

  it("says you when the reader paid", () => {
    expect(describePayment(expense(), AGUSTIN)).toBe("Paid by you on Wednesday, September 30");
  });
});

describe("shareRows", () => {
  it("marks the payer and the reader, in the server's order", () => {
    expect(shareRows(expense(), ORLANDO)).toEqual([
      { userId: AGUSTIN, label: "Agustin (paid)", percent: null, amountCents: 3334 },
      { userId: ORLANDO, label: "You", percent: null, amountCents: 3333 },
      { userId: MAYA, label: "Maya", percent: null, amountCents: 3333 },
    ]);
  });

  it("marks the reader who also paid as both", () => {
    expect(shareRows(expense(), AGUSTIN)[0].label).toBe("You (paid)");
  });

  it("shows each percentage for a percentage split", () => {
    const byPercent = expense({
      splitMethod: "PERCENTAGE",
      totalAmountCents: 7000,
      shares: [
        { userId: ORLANDO, name: "Orlando", amountOwedCents: 4200, percentBasisPoints: 6000 },
        { userId: MAYA, name: "Maya", amountOwedCents: 2800, percentBasisPoints: 4000 },
      ],
    });

    expect(shareRows(byPercent, AGUSTIN).map((row) => row.percent)).toEqual(["60%", "40%"]);
  });

  it("shows no percentage for an equal or custom split", () => {
    expect(shareRows(expense({ splitMethod: "CUSTOM" }), ORLANDO).map((row) => row.percent))
      .toEqual([null, null, null]);
  });
});

describe("describeCompletedChore", () => {
  it("says who it was assigned to and when it was completed", () => {
    const text = describeCompletedChore(chore(), ORLANDO);
    expect(text).toMatch(/^Assigned to Maya · completed /);
    expect(text).toContain("Oct");
  });

  it("says you when it was assigned to the reader", () => {
    expect(describeCompletedChore(chore(), MAYA)).toMatch(/^Assigned to you · /);
  });

  it("says unassigned for a chore anyone could complete", () => {
    expect(describeCompletedChore(chore({ assignee: null }), MAYA)).toMatch(/^Unassigned · /);
  });

  it("leaves the date off when there is none", () => {
    expect(describeCompletedChore(chore({ completedAt: null }), ORLANDO)).toBe(
      "Assigned to Maya"
    );
  });
});
