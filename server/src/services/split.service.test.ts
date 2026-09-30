import { describe, it, expect } from "vitest";
import {
  FULL_BASIS_POINTS,
  splitExpense,
  type SplitInput,
  type SplitParticipant,
} from "./split.service";
import {
  DuplicateParticipantError,
  NoParticipantsError,
  PercentSumInvalidError,
  SplitSumMismatchError,
  ValidationError,
} from "./errors";
import { MAX_AMOUNT_CENTS } from "./validation";

const ALEX = "clx0000000000000000000001";
const SAM = "clx0000000000000000000002";
const MAYA = "clx0000000000000000000003";

function people(...userIds: string[]): SplitParticipant[] {
  return userIds.map((userId) => ({ userId }));
}

function amountsOf(input: SplitInput): number[] {
  return splitExpense(input).map((share) => share.amountOwedCents);
}

function total(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Runs `fn` and returns what it threw, so a test can inspect the error. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw, but it returned.");
}

describe("splitExpense — EQUAL", () => {
  it("splits $100.00 three ways as 3334, 3333, 3333", () => {
    const shares = splitExpense({
      totalAmountCents: 10000,
      splitMethod: "EQUAL",
      participants: people(ALEX, SAM, MAYA),
    });

    expect(shares).toEqual([
      { userId: ALEX, amountOwedCents: 3334, percentBasisPoints: null },
      { userId: SAM, amountOwedCents: 3333, percentBasisPoints: null },
      { userId: MAYA, amountOwedCents: 3333, percentBasisPoints: null },
    ]);
    expect(total(shares.map((s) => s.amountOwedCents))).toBe(10000);
  });

  it("gives remainder cents in request order, so reordering moves them", () => {
    const amounts = amountsOf({
      totalAmountCents: 10000,
      splitMethod: "EQUAL",
      participants: people(MAYA, SAM, ALEX),
    });

    expect(amounts).toEqual([3334, 3333, 3333]);
  });

  it("gives more than one remainder cent when needed", () => {
    expect(
      amountsOf({
        totalAmountCents: 1002,
        splitMethod: "EQUAL",
        participants: people(ALEX, SAM, MAYA, "clx4"),
      })
    ).toEqual([251, 251, 250, 250]);
  });

  it("splits an evenly divisible total with no remainder", () => {
    expect(
      amountsOf({
        totalAmountCents: 9000,
        splitMethod: "EQUAL",
        participants: people(ALEX, SAM, MAYA),
      })
    ).toEqual([3000, 3000, 3000]);
  });

  it("gives a single participant the whole total", () => {
    expect(
      amountsOf({
        totalAmountCents: 4321,
        splitMethod: "EQUAL",
        participants: people(ALEX),
      })
    ).toEqual([4321]);
  });

  it("handles fewer cents than participants", () => {
    expect(
      amountsOf({
        totalAmountCents: 2,
        splitMethod: "EQUAL",
        participants: people(ALEX, SAM, MAYA),
      })
    ).toEqual([1, 1, 0]);
  });

  it("ignores amounts and percentages sent alongside an equal split", () => {
    const shares = splitExpense({
      totalAmountCents: 100,
      splitMethod: "EQUAL",
      participants: [
        { userId: ALEX, amountCents: 90, percentBasisPoints: 9000 },
        { userId: SAM, amountCents: 10, percentBasisPoints: 1000 },
      ],
    });

    expect(shares.map((s) => s.amountOwedCents)).toEqual([50, 50]);
    expect(shares.every((s) => s.percentBasisPoints === null)).toBe(true);
  });

  it("always sums to the total, with shares at most one cent apart", () => {
    const totals = [1, 2, 3, 7, 99, 100, 101, 9999, 10000, 10001, MAX_AMOUNT_CENTS];

    for (const totalCents of totals) {
      for (let n = 1; n <= 7; n++) {
        const participants = Array.from({ length: n }, (_, i) => ({
          userId: `user-${i}`,
        }));
        const amounts = amountsOf({
          totalAmountCents: totalCents,
          splitMethod: "EQUAL",
          participants,
        });

        expect(total(amounts)).toBe(totalCents);
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("splitExpense — CUSTOM", () => {
  it("uses the amounts exactly as given", () => {
    const shares = splitExpense({
      totalAmountCents: 10000,
      splitMethod: "CUSTOM",
      participants: [
        { userId: ALEX, amountCents: 5000 },
        { userId: SAM, amountCents: 3000 },
        { userId: MAYA, amountCents: 2000 },
      ],
    });

    expect(shares).toEqual([
      { userId: ALEX, amountOwedCents: 5000, percentBasisPoints: null },
      { userId: SAM, amountOwedCents: 3000, percentBasisPoints: null },
      { userId: MAYA, amountOwedCents: 2000, percentBasisPoints: null },
    ]);
  });

  it("allows a participant to owe zero", () => {
    expect(
      amountsOf({
        totalAmountCents: 500,
        splitMethod: "CUSTOM",
        participants: [
          { userId: ALEX, amountCents: 500 },
          { userId: SAM, amountCents: 0 },
        ],
      })
    ).toEqual([500, 0]);
  });

  it("rejects amounts that fall short of the total, adjusting nothing", () => {
    expect(() =>
      splitExpense({
        totalAmountCents: 10000,
        splitMethod: "CUSTOM",
        participants: [
          { userId: ALEX, amountCents: 5000 },
          { userId: SAM, amountCents: 4999 },
        ],
      })
    ).toThrow(SplitSumMismatchError);
  });

  it("rejects amounts that exceed the total", () => {
    expect(() =>
      splitExpense({
        totalAmountCents: 10000,
        splitMethod: "CUSTOM",
        participants: [
          { userId: ALEX, amountCents: 5000 },
          { userId: SAM, amountCents: 5001 },
        ],
      })
    ).toThrow(SplitSumMismatchError);
  });

  it.each([
    ["missing", undefined],
    ["negative", -100],
    ["fractional", 12.5],
    ["a string", "5000"],
  ])("rejects an amount that is %s", (_label, badAmount) => {
    const error = thrownBy(() =>
      splitExpense({
        totalAmountCents: 10000,
        splitMethod: "CUSTOM",
        participants: [
          { userId: ALEX, amountCents: 10000 },
          { userId: SAM, amountCents: badAmount as number },
        ],
      })
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toHaveProperty("participants");
  });
});

describe("splitExpense — PERCENTAGE", () => {
  it("splits $100.00 at 33.33 / 33.33 / 33.34 exactly", () => {
    const shares = splitExpense({
      totalAmountCents: 10000,
      splitMethod: "PERCENTAGE",
      participants: [
        { userId: ALEX, percentBasisPoints: 3333 },
        { userId: SAM, percentBasisPoints: 3333 },
        { userId: MAYA, percentBasisPoints: 3334 },
      ],
    });

    expect(shares).toEqual([
      { userId: ALEX, amountOwedCents: 3333, percentBasisPoints: 3333 },
      { userId: SAM, amountOwedCents: 3333, percentBasisPoints: 3333 },
      { userId: MAYA, amountOwedCents: 3334, percentBasisPoints: 3334 },
    ]);
  });

  it("hands the rounding remainder out in request order", () => {
    // 10001 * 50% = 5000.5 each; flooring leaves one cent over.
    expect(
      amountsOf({
        totalAmountCents: 10001,
        splitMethod: "PERCENTAGE",
        participants: [
          { userId: ALEX, percentBasisPoints: 5000 },
          { userId: SAM, percentBasisPoints: 5000 },
        ],
      })
    ).toEqual([5001, 5000]);
  });

  it("never gives a remainder cent to a participant at 0%", () => {
    expect(
      amountsOf({
        totalAmountCents: 101,
        splitMethod: "PERCENTAGE",
        participants: [
          { userId: ALEX, percentBasisPoints: 0 },
          { userId: SAM, percentBasisPoints: 5000 },
          { userId: MAYA, percentBasisPoints: 5000 },
        ],
      })
    ).toEqual([0, 51, 50]);
  });

  it("gives one participant at 100% the whole total", () => {
    expect(
      amountsOf({
        totalAmountCents: 777,
        splitMethod: "PERCENTAGE",
        participants: [{ userId: ALEX, percentBasisPoints: FULL_BASIS_POINTS }],
      })
    ).toEqual([777]);
  });

  it("stays exact at the largest storable amount", () => {
    const amounts = amountsOf({
      totalAmountCents: MAX_AMOUNT_CENTS,
      splitMethod: "PERCENTAGE",
      participants: [
        { userId: ALEX, percentBasisPoints: 3333 },
        { userId: SAM, percentBasisPoints: 3333 },
        { userId: MAYA, percentBasisPoints: 3334 },
      ],
    });

    expect(total(amounts)).toBe(MAX_AMOUNT_CENTS);
  });

  it("always sums to the total across awkward percentages", () => {
    const splits = [
      [3333, 3333, 3334],
      [1, 9999],
      [1, 1, 9998],
      [2500, 2500, 2500, 2500],
      [0, 0, 10000],
      [1429, 1429, 1428, 1428, 1429, 1428, 1429],
    ];
    const totals = [1, 3, 7, 99, 101, 9999, 10001, 123457, MAX_AMOUNT_CENTS];

    for (const bps of splits) {
      for (const totalCents of totals) {
        const amounts = amountsOf({
          totalAmountCents: totalCents,
          splitMethod: "PERCENTAGE",
          participants: bps.map((bp, i) => ({
            userId: `user-${i}`,
            percentBasisPoints: bp,
          })),
        });

        expect(total(amounts)).toBe(totalCents);
        amounts.forEach((amount, i) => {
          if (bps[i] === 0) expect(amount).toBe(0);
        });
      }
    }
  });

  it.each([
    ["under 100%", [5000, 4999]],
    ["over 100%", [5000, 5001]],
    ["all zero", [0, 0]],
  ])("rejects percentages that sum to %s", (_label, bps) => {
    expect(() =>
      splitExpense({
        totalAmountCents: 10000,
        splitMethod: "PERCENTAGE",
        participants: [
          { userId: ALEX, percentBasisPoints: bps[0] },
          { userId: SAM, percentBasisPoints: bps[1] },
        ],
      })
    ).toThrow(PercentSumInvalidError);
  });

  it.each([
    ["missing", undefined],
    ["negative", -5000],
    ["fractional", 3333.3],
  ])("rejects a percentage that is %s", (_label, badPoints) => {
    const error = thrownBy(() =>
      splitExpense({
        totalAmountCents: 10000,
        splitMethod: "PERCENTAGE",
        participants: [
          { userId: ALEX, percentBasisPoints: 10000 },
          { userId: SAM, percentBasisPoints: badPoints as number },
        ],
      })
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toHaveProperty("participants");
  });
});

describe("splitExpense — rules shared by every method", () => {
  it.each(["EQUAL", "CUSTOM", "PERCENTAGE"] as const)(
    "%s rejects an empty participant list",
    (splitMethod) => {
      const error = thrownBy(() =>
        splitExpense({ totalAmountCents: 1000, splitMethod, participants: [] })
      );

      expect(error).toBeInstanceOf(NoParticipantsError);
      expect(error).toMatchObject({ code: "NO_PARTICIPANTS", status: 400 });
    }
  );

  it("rejects a participant listed twice", () => {
    const error = thrownBy(() =>
      splitExpense({
        totalAmountCents: 1000,
        splitMethod: "EQUAL",
        participants: people(ALEX, SAM, ALEX),
      })
    );

    expect(error).toBeInstanceOf(DuplicateParticipantError);
    expect(error).toMatchObject({ code: "DUPLICATE_PARTICIPANT", status: 400 });
  });

  it.each([
    ["zero", 0],
    ["negative", -100],
    ["fractional", 12.5],
    ["a string", "1000"],
    ["above the storable maximum", MAX_AMOUNT_CENTS + 1],
  ])("rejects a total that is %s", (_label, badTotal) => {
    const error = thrownBy(() =>
      splitExpense({
        totalAmountCents: badTotal as number,
        splitMethod: "EQUAL",
        participants: people(ALEX),
      })
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toHaveProperty("totalAmountCents");
  });

  it("rejects an unknown split method", () => {
    const error = thrownBy(() =>
      splitExpense({
        totalAmountCents: 1000,
        splitMethod: "BY_VIBES" as never,
        participants: people(ALEX),
      })
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toHaveProperty("splitMethod");
  });

  it("rejects a participant with no user id", () => {
    const error = thrownBy(() =>
      splitExpense({
        totalAmountCents: 1000,
        splitMethod: "EQUAL",
        participants: [{ userId: ALEX }, { userId: "" }],
      })
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toHaveProperty("participants");
  });

  it("rejects participants that are not a list", () => {
    const error = thrownBy(() =>
      splitExpense({
        totalAmountCents: 1000,
        splitMethod: "EQUAL",
        participants: ALEX as never,
      })
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toHaveProperty("participants");
  });

  it("reports every invalid field at once", () => {
    const error = thrownBy(() =>
      splitExpense({
        totalAmountCents: 0,
        splitMethod: "NOPE" as never,
        participants: "nobody" as never,
      })
    );

    expect(Object.keys((error as ValidationError).fields).sort()).toEqual([
      "participants",
      "splitMethod",
      "totalAmountCents",
    ]);
  });
});
