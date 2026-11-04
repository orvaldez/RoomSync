import { describe, expect, it } from "vitest";
import { balancesOf, threeRoommates, useCleanDatabase } from "./helpers";

/**
 * #90 end to end, against PostgreSQL: only the payer or the recipient can
 * record a settlement (threat model H4), and every expense and settlement
 * records who entered it, from the session (M4).
 *
 * Sam pays $90.00 for internet split three ways, so Alex and Maya each owe
 * Sam 3000.
 */
const pool = useCleanDatabase();

async function household() {
  const roommates = await threeRoommates();
  const { householdId, alex, sam, maya } = roommates;
  const base = `/api/households/${householdId}`;

  const created = await alex.agent.post(`${base}/expenses`).send({
    description: "Internet",
    totalAmountCents: 9000,
    expenseDate: "2026-11-01",
    paidByUserId: sam.id,
    splitMethod: "EQUAL",
    participants: [{ userId: alex.id }, { userId: sam.id }, { userId: maya.id }],
  });
  expect(created.status).toBe(201);

  return { ...roommates, base, expense: created.body.expense };
}

describe("who may record a settlement", () => {
  it("refuses a member recording a payment between two others, and writes nothing", async () => {
    const { householdId, base, alex, sam, maya } = await household();

    // Alex tries to record that Maya paid Sam back, wiping out Maya's debt.
    const res = await alex.agent
      .post(`${base}/settlements`)
      .send({ fromUserId: maya.id, toUserId: sam.id, amountCents: 3000 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_PARTY_TO_SETTLEMENT");
    const { rows } = await pool.query("SELECT 1 FROM settlements");
    expect(rows).toHaveLength(0);
    expect((await balancesOf(sam, householdId)).net.Maya).toBe(3000);
  });

  it("lets the payer record it, and the recipient record their own", async () => {
    const { householdId, base, alex, sam, maya } = await household();

    const byPayer = await maya.agent
      .post(`${base}/settlements`)
      .send({ fromUserId: maya.id, toUserId: sam.id, amountCents: 1000 });
    const byRecipient = await sam.agent
      .post(`${base}/settlements`)
      .send({ fromUserId: alex.id, toUserId: sam.id, amountCents: 1000 });

    expect(byPayer.status).toBe(201);
    expect(byRecipient.status).toBe(201);
    const { net } = await balancesOf(sam, householdId);
    expect(net).toEqual({ Alex: 2000, Maya: 2000 });
  });
});

describe("who entered each record", () => {
  it("stores and returns who entered an expense, not who paid it", async () => {
    const { base, alex, sam, expense } = await household();

    // Alex entered it; Sam paid.
    expect(expense.paidBy.userId).toBe(sam.id);
    expect(expense.createdBy).toEqual({ userId: alex.id, name: "Alex" });

    const { rows } = await pool.query<{ created_by_user_id: string }>(
      "SELECT created_by_user_id FROM expenses WHERE expense_id = $1",
      [expense.id]
    );
    expect(rows[0].created_by_user_id).toBe(alex.id);

    const detail = await sam.agent.get(`${base}/expenses/${expense.id}`);
    expect(detail.body.expense.createdBy).toEqual({ userId: alex.id, name: "Alex" });
  });

  it("keeps who entered an expense when someone else edits it", async () => {
    const { base, alex, sam, maya, expense } = await household();

    const edited = await sam.agent.patch(`${base}/expenses/${expense.id}`).send({
      description: "Internet",
      totalAmountCents: 12000,
      expenseDate: "2026-11-01",
      paidByUserId: sam.id,
      splitMethod: "EQUAL",
      participants: [{ userId: alex.id }, { userId: sam.id }, { userId: maya.id }],
    });

    expect(edited.status).toBe(200);
    expect(edited.body.expense.createdBy).toEqual({ userId: alex.id, name: "Alex" });
  });

  it("records the signed-in member for a settlement, whatever the body says", async () => {
    const { base, sam, maya } = await household();

    const res = await maya.agent.post(`${base}/settlements`).send({
      fromUserId: maya.id,
      toUserId: sam.id,
      amountCents: 500,
      createdByUserId: sam.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.settlement.createdBy).toEqual({ userId: maya.id, name: "Maya" });
    const { rows } = await pool.query<{ created_by_user_id: string }>(
      "SELECT created_by_user_id FROM settlements"
    );
    expect(rows[0].created_by_user_id).toBe(maya.id);
  });
});
