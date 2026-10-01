import { describe, it, expect } from "vitest";
import {
  CHORES,
  EXPENSES,
  PEOPLE,
  SETTLEMENTS,
  calendarDate,
  instantDaysAgo,
  seedPlanProblems,
} from "./seed-data";

// #16's acceptance criteria, checked against the data the seed writes, so the
// demo household cannot quietly lose a split method or a settlement.

describe("the demonstration household", () => {
  it("has 3 to 4 members with distinct emails and one owner, listed first", () => {
    expect(PEOPLE.length).toBeGreaterThanOrEqual(3);
    expect(PEOPLE.length).toBeLessThanOrEqual(4);
    expect(new Set(PEOPLE.map((p) => p.email)).size).toBe(PEOPLE.length);
    expect(PEOPLE.filter((p) => p.role === "OWNER").map((p) => p.key)).toEqual([PEOPLE[0].key]);
  });

  it("uses only fictional .test addresses", () => {
    for (const person of PEOPLE) {
      expect(person.email).toMatch(/@roomsync\.test$/);
    }
  });

  it("has several expenses covering all three split methods", () => {
    expect(EXPENSES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(EXPENSES.map((e) => e.splitMethod))).toEqual(
      new Set(["EQUAL", "CUSTOM", "PERCENTAGE"])
    );
  });

  it("has at least one settlement", () => {
    expect(SETTLEMENTS.length).toBeGreaterThanOrEqual(1);
  });

  it("has both outstanding and completed chores, including one overdue", () => {
    expect(CHORES.some((c) => c.completedDaysAgo === null)).toBe(true);
    expect(CHORES.some((c) => c.completedDaysAgo !== null)).toBe(true);
    expect(CHORES.some((c) => c.completedDaysAgo === null && (c.dueInDays ?? 0) < 0)).toBe(true);
  });

  it("gives every member an outstanding chore, so each dashboard shows one", () => {
    const assigned = new Set(
      CHORES.filter((c) => c.completedDaysAgo === null).map((c) => c.assignee)
    );
    for (const person of PEOPLE) {
      expect(assigned).toContain(person.key);
    }
  });

  it("only names members of the household", () => {
    const keys = new Set(PEOPLE.map((p) => p.key));
    for (const expense of EXPENSES) {
      expect(keys).toContain(expense.paidBy);
      for (const participant of expense.participants) expect(keys).toContain(participant.person);
    }
    for (const settlement of SETTLEMENTS) {
      expect(keys).toContain(settlement.from);
      expect(keys).toContain(settlement.to);
    }
  });

  it("is consistent: every expense splits and no settlement exceeds what was owed", () => {
    expect(seedPlanProblems()).toEqual([]);
  });
});

describe("seed dates", () => {
  const now = new Date(2026, 8, 30, 15, 0); // Sep 30, 3pm local

  it("gives calendar dates relative to the local day", () => {
    expect(calendarDate(now, 0)).toBe("2026-09-30");
    expect(calendarDate(now, 1)).toBe("2026-10-01");
    expect(calendarDate(now, -2)).toBe("2026-09-28");
  });

  it("gives instants at a fixed local hour", () => {
    const instant = instantDaysAgo(now, 2, 18);
    expect([instant.getDate(), instant.getHours()]).toEqual([28, 18]);
  });
});
