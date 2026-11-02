import { describe, expect, it } from "vitest";
import {
  balancesOf,
  threeRoommates,
  useCleanDatabase,
  type SignedInUser,
} from "./helpers";

/**
 * UC-05 to UC-08 end to end: expenses with each split method, the balances
 * they produce, and settlements against them, all through real SQL. Every
 * expected number is worked out by hand in the comments, so a reviewer can
 * check the arithmetic without running anything.
 */
const pool = useCleanDatabase();

type Household = Awaited<ReturnType<typeof threeRoommates>>;

/**
 * The three expenses every test here starts from.
 *
 * 1. EQUAL: Alex pays $100.00 for Alex, Sam and Maya.
 *    10000 / 3 = 3333 r 1, the extra cent to the first participant:
 *    Alex 3334, Sam 3333, Maya 3333.
 * 2. CUSTOM: Sam pays $60.00: Alex 1000, Sam 2000, Maya 3000.
 * 3. PERCENTAGE: Maya pays $25.00: Alex 50%, Sam 25%, Maya 25%:
 *    Alex 1250, Sam 625, Maya 625.
 *
 * Owed per pair, netted:
 *    Sam to Alex:  3333 (expense 1) - 1000 (expense 2) = 2333
 *    Maya to Alex: 3333 (expense 1) - 1250 (expense 3) = 2083
 *    Maya to Sam:  3000 (expense 2) -  625 (expense 3) = 2375
 */
async function recordThreeExpenses({ householdId, alex, sam, maya }: Household) {
  const post = (payer: SignedInUser, body: object) =>
    payer.agent
      .post(`/api/households/${householdId}/expenses`)
      .send({ expenseDate: "2026-10-01", paidByUserId: payer.id, ...body });

  const equal = await post(alex, {
    description: "Groceries",
    totalAmountCents: 10000,
    splitMethod: "EQUAL",
    participants: [{ userId: alex.id }, { userId: sam.id }, { userId: maya.id }],
  });
  const custom = await post(sam, {
    description: "Internet",
    totalAmountCents: 6000,
    splitMethod: "CUSTOM",
    participants: [
      { userId: alex.id, amountCents: 1000 },
      { userId: sam.id, amountCents: 2000 },
      { userId: maya.id, amountCents: 3000 },
    ],
  });
  const percentage = await post(maya, {
    description: "Cleaning supplies",
    totalAmountCents: 2500,
    splitMethod: "PERCENTAGE",
    participants: [
      { userId: alex.id, percentBasisPoints: 5000 },
      { userId: sam.id, percentBasisPoints: 2500 },
      { userId: maya.id, percentBasisPoints: 2500 },
    ],
  });

  return { equal, custom, percentage };
}

const sharesOf = (expense: { shares: { name: string; amountOwedCents: number }[] }) =>
  Object.fromEntries(expense.shares.map((s) => [s.name, s.amountOwedCents]));

describe("expenses with each split method, and the balances they produce", () => {
  it("stores each split exactly to the cent", async () => {
    const household = await threeRoommates();
    const { equal, custom, percentage } = await recordThreeExpenses(household);

    expect(equal.status).toBe(201);
    expect(sharesOf(equal.body.expense)).toEqual({ Alex: 3334, Sam: 3333, Maya: 3333 });
    expect(custom.status).toBe(201);
    expect(sharesOf(custom.body.expense)).toEqual({ Alex: 1000, Sam: 2000, Maya: 3000 });
    expect(percentage.status).toBe(201);
    expect(sharesOf(percentage.body.expense)).toEqual({ Alex: 1250, Sam: 625, Maya: 625 });

    // The shares in the database add up to each total (FR-09).
    const { rows } = await pool.query<{ total: number; shares: string }>(
      `SELECT e.total_amount_cents AS total, SUM(s.amount_owed_cents) AS shares
       FROM expenses e JOIN expense_shares s ON s.expense_id = e.expense_id
       GROUP BY e.expense_id`
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(Number(row.shares)).toBe(row.total);
    }

    // Read back the same way the expense list and detail screens do.
    const { householdId, sam } = household;
    const list = await sam.agent.get(`/api/households/${householdId}/expenses`);
    expect(list.status).toBe(200);
    expect(list.body.expenses).toHaveLength(3);

    const detail = await sam.agent.get(
      `/api/households/${householdId}/expenses/${custom.body.expense.id}`
    );
    expect(detail.status).toBe(200);
    expect(detail.body.expense).toMatchObject({
      description: "Internet",
      splitMethod: "CUSTOM",
      paidBy: { name: "Sam" },
    });
  });

  it("nets the balances per pair, from each member's point of view", async () => {
    const household = await threeRoommates();
    const { householdId, alex, sam, maya } = household;
    await recordThreeExpenses(household);

    // Positive: that member owes the viewer. Negative: the viewer owes them.
    expect(await balancesOf(alex, householdId)).toEqual({
      net: { Sam: 2333, Maya: 2083 },
      totals: { youOweCents: 0, owedToYouCents: 4416 },
    });
    expect(await balancesOf(sam, householdId)).toEqual({
      net: { Alex: -2333, Maya: 2375 },
      totals: { youOweCents: 2333, owedToYouCents: 2375 },
    });
    expect(await balancesOf(maya, householdId)).toEqual({
      net: { Alex: -2083, Sam: -2375 },
      totals: { youOweCents: 4458, owedToYouCents: 0 },
    });
  });

  it("writes nothing for a custom split that doesn't add up", async () => {
    const { householdId, alex, sam } = await threeRoommates();

    const res = await alex.agent
      .post(`/api/households/${householdId}/expenses`)
      .send({
        description: "Off by a cent",
        totalAmountCents: 1000,
        expenseDate: "2026-10-01",
        paidByUserId: alex.id,
        splitMethod: "CUSTOM",
        participants: [
          { userId: alex.id, amountCents: 500 },
          { userId: sam.id, amountCents: 499 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SPLIT_SUM_MISMATCH");
    const { rows } = await pool.query("SELECT 1 FROM expenses");
    expect(rows).toHaveLength(0);
  });
});

describe("settlements against those balances", () => {
  it("reduces the balance, and refuses more than is owed", async () => {
    const household = await threeRoommates();
    const { householdId, alex, sam } = household;
    await recordThreeExpenses(household);

    const settle = (amountCents: number, from = sam, to = alex) =>
      from.agent
        .post(`/api/households/${householdId}/settlements`)
        .send({ fromUserId: from.id, toUserId: to.id, amountCents });

    // Sam owes Alex 2333. Paying 1000 leaves 1333.
    const paid = await settle(1000);
    expect(paid.status).toBe(201);
    expect(paid.body.settlement).toMatchObject({
      from: { name: "Sam" },
      to: { name: "Alex" },
      amountCents: 1000,
    });
    expect((await balancesOf(alex, householdId)).net.Sam).toBe(1333);

    // One cent more than the 1333 left is refused, and writes nothing.
    const over = await settle(1334);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("EXCEEDS_BALANCE");
    expect((await balancesOf(alex, householdId)).net.Sam).toBe(1333);

    // Alex doesn't owe Sam anything, so any amount that way is refused.
    const wrongWay = await settle(1, alex, sam);
    expect(wrongWay.status).toBe(409);
    expect(wrongWay.body.error.code).toBe("EXCEEDS_BALANCE");

    // Paying the exact remainder settles the pair.
    expect((await settle(1333)).status).toBe(201);
    expect((await balancesOf(alex, householdId)).net.Sam).toBe(0);
    expect((await balancesOf(sam, householdId)).net.Alex).toBe(0);

    // Both payments stay in the history after the balance reaches zero (FR-12).
    const history = await alex.agent.get(`/api/households/${householdId}/settlements`);
    expect(history.body.settlements.map((s: { amountCents: number }) => s.amountCents))
      .toEqual([1333, 1000]);
  });
});
