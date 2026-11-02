import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { getPrisma } from "../repositories/prisma";
import { resetDatabase } from "./test-database";
import { createHousehold, joinHousehold, signUp, type SignedInUser } from "./helpers";

/**
 * US-12 end to end: editing and deleting an expense against the real
 * database, and what that does to balances, history and the dashboard
 * (analysis-model.md §8.1).
 *
 * Alex owns the household; Sam pays a $90.00 internet bill split equally,
 * 3000 each, so Alex and Maya each owe Sam 3000.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

beforeEach(async () => {
  await resetDatabase(pool);
});

afterAll(async () => {
  await getPrisma().$disconnect();
  await pool.end();
});

async function household() {
  const alex = await signUp("Alex");
  const sam = await signUp("Sam");
  const maya = await signUp("Maya");
  const householdId = await createHousehold(alex);
  await joinHousehold(householdId, alex, sam);
  await joinHousehold(householdId, alex, maya);
  const base = `/api/households/${householdId}`;

  const body = (totalAmountCents: number) => ({
    description: "Internet",
    totalAmountCents,
    expenseDate: "2026-10-01",
    paidByUserId: sam.id,
    splitMethod: "EQUAL",
    participants: [{ userId: alex.id }, { userId: sam.id }, { userId: maya.id }],
  });

  const created = await sam.agent.post(`${base}/expenses`).send(body(9000));
  expect(created.status).toBe(201);

  return { householdId, base, alex, sam, maya, body, expenseId: created.body.expense.id as string };
}

/** `viewer`'s net balance with `other`: positive means `other` owes the viewer. */
async function net(viewer: SignedInUser, other: SignedInUser, base: string): Promise<number> {
  const res = await viewer.agent.get(`${base}/balances`);
  return res.body.balances.find((b: { userId: string }) => b.userId === other.id).netCents;
}

describe("editing an expense", () => {
  it("recalculates the split, and the balances follow on the next read", async () => {
    const { base, alex, sam, body, expenseId } = await household();
    expect(await net(sam, alex, base)).toBe(3000);

    // The bill was really $120.00: 4000 each.
    const res = await sam.agent.patch(`${base}/expenses/${expenseId}`).send(body(12000));

    expect(res.status).toBe(200);
    expect(res.body.expense.totalAmountCents).toBe(12000);
    expect(res.body.expense.shares.map((s: { amountOwedCents: number }) => s.amountOwedCents))
      .toEqual([4000, 4000, 4000]);
    expect(new Date(res.body.expense.updatedAt).getTime()).toBeGreaterThan(
      new Date(res.body.expense.createdAt).getTime()
    );
    expect(await net(sam, alex, base)).toBe(4000);

    // The old shares were replaced, not added to.
    const { rows } = await pool.query("SELECT 1 FROM expense_shares WHERE expense_id = $1", [
      expenseId,
    ]);
    expect(rows).toHaveLength(3);
  });

  it("lets the owner edit, and refuses a member who didn't pay", async () => {
    const { base, alex, maya, body, expenseId } = await household();

    const refused = await maya.agent.patch(`${base}/expenses/${expenseId}`).send(body(1));
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("NOT_EXPENSE_EDITOR");

    const byOwner = await alex.agent.patch(`${base}/expenses/${expenseId}`).send(body(6000));
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.expense.totalAmountCents).toBe(6000);
  });

  it("refuses a split that doesn't add up, and changes nothing", async () => {
    const { base, sam, alex, expenseId } = await household();

    const res = await sam.agent.patch(`${base}/expenses/${expenseId}`).send({
      description: "Internet",
      totalAmountCents: 9000,
      expenseDate: "2026-10-01",
      paidByUserId: sam.id,
      splitMethod: "CUSTOM",
      participants: [
        { userId: alex.id, amountCents: 4500 },
        { userId: sam.id, amountCents: 4499 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SPLIT_SUM_MISMATCH");
    expect(await net(sam, alex, base)).toBe(3000);
  });
});

describe("deleting an expense", () => {
  it("drops it from balances and lists, keeps it for History, and keeps payments", async () => {
    const { base, alex, sam, maya, body, expenseId } = await household();

    // Alex pays Sam back in full before the expense turns out to be wrong.
    const paid = await alex.agent
      .post(`${base}/settlements`)
      .send({ fromUserId: alex.id, toUserId: sam.id, amountCents: 3000 });
    expect(paid.status).toBe(201);
    expect(await net(sam, alex, base)).toBe(0);

    const res = await sam.agent.delete(`${base}/expenses/${expenseId}`);
    expect(res.status).toBe(204);

    // The payment really happened, so with the expense gone Sam now owes Alex
    // the 3000 back (§8.1, decision 3). Maya's 3000 debt is simply gone.
    expect(await net(alex, sam, base)).toBe(3000);
    expect(await net(sam, maya, base)).toBe(0);
    const settlements = await alex.agent.get(`${base}/settlements`);
    expect(settlements.body.settlements).toHaveLength(1);

    // Gone from the list and the dashboard...
    expect((await sam.agent.get(`${base}/expenses`)).body.expenses).toHaveLength(0);
    const dashboard = await sam.agent.get(`${base}/dashboard`);
    expect(
      dashboard.body.recentActivity.filter((a: { type: string }) => a.type === "EXPENSE")
    ).toHaveLength(0);

    // ...but still in History and at its own address, saying who deleted it.
    const history = await sam.agent.get(`${base}/expenses?include=deleted`);
    expect(history.body.expenses).toHaveLength(1);
    expect(history.body.expenses[0].deleted).toMatchObject({ by: { userId: sam.id, name: "Sam" } });
    const detail = await maya.agent.get(`${base}/expenses/${expenseId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.expense.deleted.by.name).toBe("Sam");

    // A deleted expense can't be edited, and deleting it again changes nothing.
    const edit = await sam.agent.patch(`${base}/expenses/${expenseId}`).send(body(9000));
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe("EXPENSE_DELETED");
    expect((await alex.agent.delete(`${base}/expenses/${expenseId}`)).status).toBe(204);
    const { rows } = await pool.query<{ deleted_by_user_id: string }>(
      "SELECT deleted_by_user_id FROM expenses WHERE expense_id = $1",
      [expenseId]
    );
    expect(rows[0].deleted_by_user_id).toBe(sam.id);
  });

  it("refuses a member who didn't pay", async () => {
    const { base, maya, expenseId } = await household();

    const res = await maya.agent.delete(`${base}/expenses/${expenseId}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_EXPENSE_EDITOR");
    expect((await maya.agent.get(`${base}/expenses`)).body.expenses).toHaveLength(1);
  });

  it("can't reach another household's expense through one's own", async () => {
    const { expenseId } = await household();
    const riley = await signUp("Riley");
    const rileysHousehold = await createHousehold(riley, "Riley's place");
    const ownBase = `/api/households/${rileysHousehold}`;

    for (const res of [
      await riley.agent.delete(`${ownBase}/expenses/${expenseId}`),
      await riley.agent.patch(`${ownBase}/expenses/${expenseId}`).send({}),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("EXPENSE_NOT_FOUND");
    }
  });
});
