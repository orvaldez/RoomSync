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
import { createSettlement, listSettlements } from "./settlement.service";
import {
  ExceedsBalanceError,
  MemberNotInHouseholdError,
  SameMemberError,
  ValidationError,
} from "./errors";

const createSettlementChecked = vi.mocked(ledgerRepository.createSettlementChecked);
const listSettlementsRepo = vi.mocked(ledgerRepository.listSettlements);
const findRole = vi.mocked(householdRepository.findRole);

const HOUSEHOLD_ID = "clxHOUSEHOLD0000000000000";
const ME = "me";
const MAYA = "maya";
const OUTSIDER = "outsider";

/** The ledger the repository hands the check, as the database would at write time. */
let ledger: ledgerRepository.LedgerEntries;

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to reject, but it resolved.");
}

beforeEach(() => {
  vi.resetAllMocks();
  findRole.mockImplementation(async (userId) =>
    userId === ME ? "OWNER" : userId === MAYA ? "MEMBER" : null
  );
  // Maya owes me 18.33 unless a test says otherwise.
  ledger = {
    debts: [
      { debtorId: MAYA, creditorId: ME, amountCents: 3333 },
      { debtorId: ME, creditorId: MAYA, amountCents: 1500 },
    ],
    payments: [],
  };
  // Behaves like the real repository: runs the check against the ledger
  // inside the "transaction", and writes only if it passes.
  createSettlementChecked.mockImplementation(async (settlement, check) => {
    check(ledger);
    return {
      id: "clxSETTLEMENT00000000000",
      householdId: settlement.householdId,
      from: { userId: settlement.fromUserId, name: "From" },
      to: { userId: settlement.toUserId, name: "To" },
      amountCents: settlement.amountCents,
      note: settlement.note,
      settledAt: new Date("2026-09-30T18:00:00.000Z"),
    };
  });
});

describe("createSettlement (UC-08)", () => {
  it("records a payment up to the outstanding balance", async () => {
    const settlement = await createSettlement(HOUSEHOLD_ID, {
      fromUserId: MAYA,
      toUserId: ME,
      amountCents: 1833,
      note: "  venmo  ",
    });

    expect(createSettlementChecked).toHaveBeenCalledWith(
      {
        householdId: HOUSEHOLD_ID,
        fromUserId: MAYA,
        toUserId: ME,
        amountCents: 1833,
        note: "venmo",
      },
      expect.any(Function)
    );
    expect(settlement).toMatchObject({ amountCents: 1833, note: "venmo" });
  });

  it("allows paying part of the balance", async () => {
    await expect(
      createSettlement(HOUSEHOLD_ID, { fromUserId: MAYA, toUserId: ME, amountCents: 500 })
    ).resolves.toMatchObject({ amountCents: 500 });
  });

  it("stores a blank note as none", async () => {
    await createSettlement(HOUSEHOLD_ID, {
      fromUserId: MAYA,
      toUserId: ME,
      amountCents: 100,
      note: "   ",
    });

    expect(createSettlementChecked.mock.calls[0][0].note).toBeNull();
  });

  it("refuses more than is owed, even by a cent (UC-08 4a)", async () => {
    const error = await rejectionOf(
      createSettlement(HOUSEHOLD_ID, { fromUserId: MAYA, toUserId: ME, amountCents: 1834 })
    );

    expect(error).toBeInstanceOf(ExceedsBalanceError);
    expect(error).toMatchObject({ code: "EXCEEDS_BALANCE", status: 409 });
  });

  it("refuses any payment toward a debt that runs the other way", async () => {
    // Maya owes me; a payment from me to Maya would invent a debt.
    await expect(
      createSettlement(HOUSEHOLD_ID, { fromUserId: ME, toUserId: MAYA, amountCents: 1 })
    ).rejects.toThrow(ExceedsBalanceError);
  });

  it("checks against the ledger at write time, not an earlier view (UC-08 4e)", async () => {
    // Since the member last looked, Maya paid 1000 in another tab.
    ledger.payments = [{ fromUserId: MAYA, toUserId: ME, amountCents: 1000 }];

    await expect(
      createSettlement(HOUSEHOLD_ID, { fromUserId: MAYA, toUserId: ME, amountCents: 1833 })
    ).rejects.toThrow(ExceedsBalanceError);
    await expect(
      createSettlement(HOUSEHOLD_ID, { fromUserId: MAYA, toUserId: ME, amountCents: 833 })
    ).resolves.toBeTruthy();
  });

  it.each([
    ["zero", 0],
    ["negative", -500],
    ["fractional", 12.5],
    ["a string", "1833"],
    ["missing", undefined],
  ])("rejects an amount that is %s (UC-08 4b)", async (_label, amountCents) => {
    const error = await rejectionOf(
      createSettlement(HOUSEHOLD_ID, { fromUserId: MAYA, toUserId: ME, amountCents })
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toHaveProperty("amountCents");
    expect(createSettlementChecked).not.toHaveBeenCalled();
  });

  it("rejects a note over 200 characters", async () => {
    const error = await rejectionOf(
      createSettlement(HOUSEHOLD_ID, {
        fromUserId: MAYA,
        toUserId: ME,
        amountCents: 100,
        note: "x".repeat(201),
      })
    );

    expect((error as ValidationError).fields).toHaveProperty("note");
  });

  it("rejects settling with yourself (UC-08 4c)", async () => {
    const error = await rejectionOf(
      createSettlement(HOUSEHOLD_ID, { fromUserId: ME, toUserId: ME, amountCents: 100 })
    );

    expect(error).toBeInstanceOf(SameMemberError);
    expect(error).toMatchObject({ code: "SAME_MEMBER", status: 400 });
  });

  it.each([
    ["payer", { fromUserId: OUTSIDER, toUserId: ME }],
    ["recipient", { fromUserId: MAYA, toUserId: OUTSIDER }],
    ["missing payer", { fromUserId: undefined, toUserId: ME }],
  ])("rejects a %s outside the household (UC-08 4d)", async (_label, parties) => {
    const error = await rejectionOf(
      createSettlement(HOUSEHOLD_ID, { ...parties, amountCents: 100 })
    );

    expect(error).toBeInstanceOf(MemberNotInHouseholdError);
    expect(error).toMatchObject({ code: "MEMBER_NOT_IN_HOUSEHOLD", status: 400 });
    expect(createSettlementChecked).not.toHaveBeenCalled();
  });

  it("checks both parties against the household it was given", async () => {
    await createSettlement(HOUSEHOLD_ID, { fromUserId: MAYA, toUserId: ME, amountCents: 100 });

    expect(findRole).toHaveBeenCalledWith(MAYA, HOUSEHOLD_ID);
    expect(findRole).toHaveBeenCalledWith(ME, HOUSEHOLD_ID);
  });
});

describe("listSettlements", () => {
  it("returns every settlement in the contract's shape, including paid-off ones", async () => {
    listSettlementsRepo.mockResolvedValue([
      {
        id: "s1",
        householdId: HOUSEHOLD_ID,
        from: { userId: MAYA, name: "Maya" },
        to: { userId: ME, name: "Me" },
        amountCents: 1833,
        note: null,
        settledAt: new Date("2026-09-30T18:00:00.000Z"),
      },
    ]);

    const settlements = await listSettlements(HOUSEHOLD_ID);

    expect(settlements).toEqual([
      {
        id: "s1",
        from: { userId: MAYA, name: "Maya" },
        to: { userId: ME, name: "Me" },
        amountCents: 1833,
        note: null,
        settledAt: new Date("2026-09-30T18:00:00.000Z"),
      },
    ]);
  });
});
