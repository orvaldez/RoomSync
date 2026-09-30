import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatBasisPoints,
  formatCents,
  parseDollarsToCents,
  parsePercentToBasisPoints,
  todayAsCalendarDate,
} from "./money";

describe("parseDollarsToCents", () => {
  it.each([
    ["12", 1200],
    ["12.3", 1230],
    ["12.30", 1230],
    ["12.34", 1234],
    ["0.29", 29],
    [".5", 50],
    ["12.", 1200],
    ["0", 0],
    ["$84.01", 8401],
    ["1,234.56", 123456],
    ["$1,234,567.89", 123456789],
    ["  100  ", 10000],
  ])("reads %j as %i cents", (input, cents) => {
    expect(parseDollarsToCents(input)).toBe(cents);
  });

  it("is exact where floating point is not", () => {
    // parseFloat("0.29") * 100 is 28.999999999999996.
    expect(parseDollarsToCents("0.29")).toBe(29);
    expect(parseDollarsToCents("1.13")).toBe(113);
    expect(parseDollarsToCents("4.35")).toBe(435);
  });

  it("rejects more than two decimal places rather than rounding (UC-05 2c)", () => {
    expect(parseDollarsToCents("84.015")).toBeNull();
    expect(parseDollarsToCents("0.001")).toBeNull();
  });

  it.each(["", "   ", ".", "$", "abc", "12a", "1.2.3", "-5", "1e3", "12 34", "$$5"])(
    "rejects %j",
    (input) => {
      expect(parseDollarsToCents(input)).toBeNull();
    }
  );
});

describe("parsePercentToBasisPoints", () => {
  it.each([
    ["100", 10000],
    ["50", 5000],
    ["33.33", 3333],
    ["33.3", 3330],
    ["0.01", 1],
    ["25%", 2500],
    ["0", 0],
  ])("reads %j as %i basis points", (input, points) => {
    expect(parsePercentToBasisPoints(input)).toBe(points);
  });

  it("rejects more than two decimal places", () => {
    expect(parsePercentToBasisPoints("33.333")).toBeNull();
  });

  it.each(["", "%", "abc", "-10", "50%%"])("rejects %j", (input) => {
    expect(parsePercentToBasisPoints(input)).toBeNull();
  });
});

describe("formatCents", () => {
  it.each([
    [0, "$0.00"],
    [5, "$0.05"],
    [50, "$0.50"],
    [1234, "$12.34"],
    [10000, "$100.00"],
    [123456789, "$1,234,567.89"],
    [-401, "-$4.01"],
  ])("formats %i as %j", (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  it("round-trips with parseDollarsToCents", () => {
    for (const cents of [0, 1, 99, 100, 8401, 123456789]) {
      expect(parseDollarsToCents(formatCents(cents))).toBe(cents);
    }
  });
});

describe("formatBasisPoints", () => {
  it.each([
    [10000, "100%"],
    [5000, "50%"],
    [3333, "33.33%"],
    [3330, "33.30%"],
    [1, "0.01%"],
    [0, "0%"],
    [-50, "-0.50%"],
    [-2500, "-25%"],
    [-3333, "-33.33%"],
    [-1, "-0.01%"],
  ])("formats %i as %j", (points, text) => {
    expect(formatBasisPoints(points)).toBe(text);
  });

  it("round-trips non-negative values with parsePercentToBasisPoints", () => {
    for (const points of [0, 1, 50, 3333, 10000]) {
      expect(parsePercentToBasisPoints(formatBasisPoints(points))).toBe(points);
    }
  });
});

describe("todayAsCalendarDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the local date, zero-padded, as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    // Months are zero-based: this is 5 March 2026, local time.
    vi.setSystemTime(new Date(2026, 2, 5, 9, 30));

    expect(todayAsCalendarDate()).toBe("2026-03-05");
  });

  it("uses the local day late in the evening, not the UTC one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 23, 30));

    expect(todayAsCalendarDate()).toBe("2026-09-29");
  });
});
