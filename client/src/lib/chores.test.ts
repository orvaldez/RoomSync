import { describe, it, expect } from "vitest";
import { daysBetween, dueLabel, formatCalendarDate } from "./chores";

describe("daysBetween", () => {
  it.each([
    ["2026-09-30", "2026-09-30", 0],
    ["2026-09-30", "2026-10-01", 1],
    ["2026-09-30", "2026-09-28", -2],
    ["2026-12-31", "2027-01-01", 1],
    ["2028-02-28", "2028-03-01", 2],
  ])("from %s to %s is %i", (from, to, days) => {
    expect(daysBetween(from, to)).toBe(days);
  });

  it("is not thrown off by a daylight-saving change", () => {
    // US clocks go back on 1 November 2026.
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });
});

describe("dueLabel", () => {
  const today = "2026-09-30";

  it.each([
    [null, "No due date", false],
    ["2026-09-30", "Due today", false],
    ["2026-10-01", "Due tomorrow", false],
    ["2026-10-02", "Due Fri, Oct 2", false],
    ["2026-09-29", "Overdue by 1 day", true],
    ["2026-09-20", "Overdue by 10 days", true],
  ])("labels %j as %j", (dueDate, text, overdue) => {
    expect(dueLabel(dueDate, today)).toEqual({ text, overdue });
  });
});

describe("formatCalendarDate", () => {
  it("shows the calendar date itself, with no time zone shift", () => {
    expect(formatCalendarDate("2026-10-02")).toBe("Fri, Oct 2");
    expect(formatCalendarDate("2027-01-01")).toBe("Fri, Jan 1");
  });
});
