import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repositories/ledger.repository", () => ({
  findEntriesInvolving: vi.fn(),
  createSettlementChecked: vi.fn(),
  listSettlements: vi.fn(),
  lockLedger: vi.fn(),
}));

vi.mock("../repositories/household.repository", () => ({
  createWithOwner: vi.fn(),
  findCurrentForUser: vi.fn(),
  hasMembership: vi.fn(),
  findRole: vi.fn(),
  listMembers: vi.fn(),
}));

import * as ledgerRepository from "../repositories/ledger.repository";
import * as householdRepository from "../repositories/household.repository";
import { getBalances, netOwed } from "./balance.service";

const findEntriesInvolving = vi.mocked(ledgerRepository.findEntriesInvolving);
const listMembers = vi.mocked(householdRepository.listMembers);

const HOUSEHOLD_ID = "clxHOUSEHOLD0000000000000";
const ME = "me";
const MAYA = "maya";
const SAM = "sam";

const debt = (debtorId: string, creditorId: string, amountCents: number) => ({
  debtorId,
  creditorId,
  amountCents,
});
const payment = (fromUserId: string, toUserId: string, amountCents: number) => ({
  fromUserId,
  toUserId,
  amountCents,
});

describe("netOwed", () => {
  it("is zero with no records (UC-07 2a)", () => {
    expect(netOwed(ME, MAYA, { debts: [], payments: [] })).toBe(0);
  });

  it("counts the debtor's shares of expenses the creditor paid", () => {
    const entries = { debts: [debt(MAYA, ME, 3333), debt(MAYA, ME, 500)], payments: [] };

    expect(netOwed(ME, MAYA, entries)).toBe(3833);
  });

  it("offsets debts running the other way", () => {
    // Maya owes me 33.33 for groceries; I owe Maya 15.00 for pizza.
    const entries = { debts: [debt(MAYA, ME, 3333), debt(ME, MAYA, 1500)], payments: [] };

    expect(netOwed(ME, MAYA, entries)).toBe(1833);
    expect(netOwed(MAYA, ME, entries)).toBe(-1833);
  });

  it("subtracts what the debtor has paid the creditor", () => {
    const entries = { debts: [debt(MAYA, ME, 3333)], payments: [payment(MAYA, ME, 2000)] };

    expect(netOwed(ME, MAYA, entries)).toBe(1333);
  });

  it("reaches exactly zero when the debt is paid in full", () => {
    const entries = { debts: [debt(MAYA, ME, 3333)], payments: [payment(MAYA, ME, 3333)] };

    expect(netOwed(ME, MAYA, entries)).toBe(0);
  });

  it("adds back what the creditor paid the debtor", () => {
    const entries = { debts: [debt(MAYA, ME, 1000)], payments: [payment(ME, MAYA, 400)] };

    expect(netOwed(ME, MAYA, entries)).toBe(1400);
  });

  it("ignores records between other people", () => {
    const entries = {
      debts: [debt(MAYA, ME, 1000), debt(SAM, MAYA, 9999)],
      payments: [payment(SAM, ME, 5000)],
    };

    expect(netOwed(ME, MAYA, entries)).toBe(1000);
  });

  it("is antisymmetric: what one owes the other is the negative of the reverse", () => {
    const entries = {
      debts: [debt(MAYA, ME, 4201), debt(ME, MAYA, 777), debt(MAYA, ME, 1)],
      payments: [payment(MAYA, ME, 1000), payment(ME, MAYA, 250)],
    };

    expect(netOwed(ME, MAYA, entries)).toBe(-netOwed(MAYA, ME, entries));
  });
});

describe("getBalances (UC-07)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listMembers.mockResolvedValue([
      { userId: ME, name: "Me", role: "OWNER", joinedAt: new Date("2026-09-01") },
      { userId: MAYA, name: "Maya", role: "MEMBER", joinedAt: new Date("2026-09-02") },
      { userId: SAM, name: "Sam", role: "MEMBER", joinedAt: new Date("2026-09-03") },
    ]);
  });

  it("returns one pairwise balance per other member, in join order", async () => {
    findEntriesInvolving.mockResolvedValue({
      debts: [debt(MAYA, ME, 2000), debt(ME, SAM, 1500)],
      payments: [],
    });

    const summary = await getBalances(HOUSEHOLD_ID, ME);

    expect(summary.balances).toEqual([
      { userId: MAYA, name: "Maya", netCents: 2000 },
      { userId: SAM, name: "Sam", netCents: -1500 },
    ]);
  });

  it("keeps the pairs separate rather than netting across the household", async () => {
    findEntriesInvolving.mockResolvedValue({
      debts: [debt(MAYA, ME, 2000), debt(ME, SAM, 1500)],
      payments: [],
    });

    const { totals } = await getBalances(HOUSEHOLD_ID, ME);

    expect(totals).toEqual({ youOweCents: 1500, owedToYouCents: 2000 });
  });

  it("shows zeros, not an empty list, when there is no activity (UC-07 2a)", async () => {
    findEntriesInvolving.mockResolvedValue({ debts: [], payments: [] });

    const summary = await getBalances(HOUSEHOLD_ID, ME);

    expect(summary.balances.map((b) => b.netCents)).toEqual([0, 0]);
    expect(summary.totals).toEqual({ youOweCents: 0, owedToYouCents: 0 });
  });

  it("reads the requester's records from the household it was given", async () => {
    findEntriesInvolving.mockResolvedValue({ debts: [], payments: [] });

    await getBalances(HOUSEHOLD_ID, ME);

    expect(findEntriesInvolving).toHaveBeenCalledWith(HOUSEHOLD_ID, ME);
    expect(listMembers).toHaveBeenCalledWith(HOUSEHOLD_ID);
  });
});
