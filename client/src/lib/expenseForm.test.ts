import { describe, it, expect } from "vitest";
import type { Expense } from "./api";
import { parseDollarsToCents, parsePercentToBasisPoints } from "./money";
import { basisPointsToInput, centsToInput, formValuesFromExpense } from "./expenseForm";

const ALEX = "user-alex";
const SAM = "user-sam";
const MAYA = "user-maya";

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    description: "Internet",
    totalAmountCents: 7000,
    expenseDate: "2026-10-01",
    paidBy: { userId: SAM, name: "Sam" },
    splitMethod: "EQUAL",
    shares: [
      { userId: ALEX, name: "Alex", amountOwedCents: 3500, percentBasisPoints: null },
      { userId: SAM, name: "Sam", amountOwedCents: 3500, percentBasisPoints: null },
    ],
    createdAt: "2026-10-01T18:00:00Z",
    updatedAt: "2026-10-01T18:00:00Z",
    deleted: null,
    ...overrides,
  };
}

describe("centsToInput", () => {
  it.each([
    [1234, "12.34"],
    [5, "0.05"],
    [1000, "10.00"],
    [0, "0.00"],
    [123456, "1234.56"],
  ])("%i cents is %s", (cents, text) => {
    expect(centsToInput(cents)).toBe(text);
  });

  it("round-trips through parseDollarsToCents", () => {
    for (const cents of [1, 99, 100, 3333, 8401, 999999]) {
      expect(parseDollarsToCents(centsToInput(cents))).toBe(cents);
    }
  });
});

describe("basisPointsToInput", () => {
  it.each([
    [3333, "33.33"],
    [5000, "50"],
    [1250, "12.5"],
    [5, "0.05"],
    [10000, "100"],
  ])("%i basis points is %s", (points, text) => {
    expect(basisPointsToInput(points)).toBe(text);
  });

  it("round-trips through parsePercentToBasisPoints", () => {
    for (const points of [1, 10, 333, 3333, 5000, 6667, 10000]) {
      expect(parsePercentToBasisPoints(basisPointsToInput(points))).toBe(points);
    }
  });
});

describe("formValuesFromExpense", () => {
  it("fills the form from an equal split", () => {
    expect(formValuesFromExpense(expense(), [ALEX, SAM, MAYA])).toEqual({
      description: "Internet",
      amount: "70.00",
      expenseDate: "2026-10-01",
      paidByUserId: SAM,
      selected: [ALEX, SAM],
      splitMethod: "EQUAL",
      customAmounts: {},
      percents: {},
    });
  });

  it("fills each member's amount for a custom split", () => {
    const custom = expense({
      splitMethod: "CUSTOM",
      shares: [
        { userId: ALEX, name: "Alex", amountOwedCents: 2000, percentBasisPoints: null },
        { userId: SAM, name: "Sam", amountOwedCents: 5000, percentBasisPoints: null },
      ],
    });

    expect(formValuesFromExpense(custom, [ALEX, SAM]).customAmounts).toEqual({
      [ALEX]: "20.00",
      [SAM]: "50.00",
    });
  });

  it("fills each member's percentage for a percentage split", () => {
    const byPercent = expense({
      splitMethod: "PERCENTAGE",
      shares: [
        { userId: ALEX, name: "Alex", amountOwedCents: 4667, percentBasisPoints: 6667 },
        { userId: SAM, name: "Sam", amountOwedCents: 2333, percentBasisPoints: 3333 },
      ],
    });

    expect(formValuesFromExpense(byPercent, [ALEX, SAM]).percents).toEqual({
      [ALEX]: "66.67",
      [SAM]: "33.33",
    });
  });

  it("selects only participants who are still members", () => {
    expect(formValuesFromExpense(expense(), [SAM]).selected).toEqual([SAM]);
  });
});
