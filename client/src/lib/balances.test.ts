import { describe, it, expect } from "vitest";
import { describeBalance, describeSettlement, paymentFor } from "./balances";

const ME = "me";
const maya = (netCents: number) => ({ userId: "maya", name: "Maya", netCents });

describe("describeBalance", () => {
  it("says the other member owes you when net is positive", () => {
    expect(describeBalance(maya(2450))).toEqual({
      text: "Maya owes you $24.50",
      direction: "owes-you",
    });
  });

  it("says you owe them when net is negative, with a positive amount", () => {
    expect(describeBalance(maya(-1200))).toEqual({
      text: "You owe Maya $12.00",
      direction: "you-owe",
    });
  });

  it("says settled up at zero", () => {
    expect(describeBalance(maya(0))).toEqual({
      text: "You and Maya are settled up",
      direction: "settled",
    });
  });
});

describe("paymentFor", () => {
  it("has the other member paying you when they owe you, for the full amount", () => {
    expect(paymentFor(maya(1833), ME)).toEqual({
      fromUserId: "maya",
      toUserId: ME,
      amountCents: 1833,
      label: "Record that Maya paid you",
    });
  });

  it("has you paying them when you owe them, as a positive amount", () => {
    expect(paymentFor(maya(-1500), ME)).toEqual({
      fromUserId: ME,
      toUserId: "maya",
      amountCents: 1500,
      label: "Record that you paid Maya",
    });
  });

  it("offers nothing when settled", () => {
    expect(paymentFor(maya(0), ME)).toBeNull();
  });
});

describe("describeSettlement", () => {
  const settlement = (fromId: string, fromName: string, toId: string, toName: string) => ({
    id: "s1",
    from: { userId: fromId, name: fromName },
    to: { userId: toId, name: toName },
    amountCents: 1833,
    note: null,
    settledAt: "2026-09-30T18:00:00.000Z",
  });

  it.each([
    [settlement("maya", "Maya", ME, "Me"), "Maya paid you $18.33"],
    [settlement(ME, "Me", "sam", "Sam"), "You paid Sam $18.33"],
    [settlement("maya", "Maya", "sam", "Sam"), "Maya paid Sam $18.33"],
  ])("reads %# from the viewer's side", (s, text) => {
    expect(describeSettlement(s, ME)).toBe(text);
  });
});
