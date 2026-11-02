import { describe, expect, it } from "vitest";
import { createHousehold, signUp, threeRoommates, useCleanDatabase } from "./helpers";

/**
 * NFR-05 end to end: a user in another household gets 404 from every
 * household-scoped endpoint, so they can't even confirm the household exists.
 * Riley has a household of their own, so a missing-membership bug can't hide
 * behind "Riley isn't in any household".
 */
useCleanDatabase();

describe("someone from another household", () => {
  it("gets 404 HOUSEHOLD_NOT_FOUND from every household endpoint", async () => {
    const { householdId, alex, sam } = await threeRoommates();
    const riley = await signUp("Riley");
    await createHousehold(riley, "Riley's place");
    const base = `/api/households/${householdId}`;

    const expense = await alex.agent.post(`${base}/expenses`).send({
      description: "Groceries",
      totalAmountCents: 3000,
      expenseDate: "2026-10-01",
      paidByUserId: alex.id,
      splitMethod: "EQUAL",
      participants: [{ userId: alex.id }, { userId: sam.id }],
    });
    const chore = await alex.agent
      .post(`${base}/chores`)
      .send({ title: "Dishes", assignedUserId: alex.id });
    const expenseId = expense.body.expense.id;
    const choreId = chore.body.chore.id;

    const expenseBody = {
      description: "Not mine",
      totalAmountCents: 100,
      expenseDate: "2026-10-01",
      paidByUserId: riley.id,
      splitMethod: "EQUAL",
      participants: [{ userId: riley.id }],
    };

    const attempts: [string, () => Promise<{ status: number; body: { error?: { code?: string } } }>][] = [
      ["GET members", () => riley.agent.get(`${base}/members`)],
      ["POST invitations", () => riley.agent.post(`${base}/invitations`)],
      ["GET expenses", () => riley.agent.get(`${base}/expenses`)],
      ["GET expense", () => riley.agent.get(`${base}/expenses/${expenseId}`)],
      ["POST expenses", () => riley.agent.post(`${base}/expenses`).send(expenseBody)],
      ["POST preview", () => riley.agent.post(`${base}/expenses/preview`).send(expenseBody)],
      ["GET balances", () => riley.agent.get(`${base}/balances`)],
      ["GET settlements", () => riley.agent.get(`${base}/settlements`)],
      [
        "POST settlements",
        () =>
          riley.agent
            .post(`${base}/settlements`)
            .send({ fromUserId: sam.id, toUserId: alex.id, amountCents: 100 }),
      ],
      ["GET chores", () => riley.agent.get(`${base}/chores`)],
      ["POST chores", () => riley.agent.post(`${base}/chores`).send({ title: "Not mine" })],
      ["PATCH chore", () => riley.agent.patch(`${base}/chores/${choreId}`).send({ title: "Mine now" })],
      ["POST complete", () => riley.agent.post(`${base}/chores/${choreId}/complete`)],
      ["GET dashboard", () => riley.agent.get(`${base}/dashboard`)],
    ];

    for (const [name, attempt] of attempts) {
      const res = await attempt();
      expect({ name, status: res.status, code: res.body?.error?.code }).toEqual({
        name,
        status: 404,
        code: "HOUSEHOLD_NOT_FOUND",
      });
    }

    // And nothing Riley sent was written.
    const after = await alex.agent.get(`${base}/expenses`);
    expect(after.body.expenses).toHaveLength(1);
    const chores = await alex.agent.get(`${base}/chores`);
    expect(chores.body.chores).toMatchObject([{ title: "Dishes", isComplete: false }]);
  });

  it("can't reach another household's expense or chore through their own household", async () => {
    const { householdId, alex, sam } = await threeRoommates();
    const riley = await signUp("Riley");
    const rileysHouseholdId = await createHousehold(riley, "Riley's place");

    const expense = await alex.agent.post(`/api/households/${householdId}/expenses`).send({
      description: "Groceries",
      totalAmountCents: 3000,
      expenseDate: "2026-10-01",
      paidByUserId: alex.id,
      splitMethod: "EQUAL",
      participants: [{ userId: alex.id }, { userId: sam.id }],
    });
    const chore = await alex.agent
      .post(`/api/households/${householdId}/chores`)
      .send({ title: "Dishes", assignedUserId: alex.id });

    // Riley is a member of the household in the path, but the ids belong to Alex's.
    const ownBase = `/api/households/${rileysHouseholdId}`;
    const viaExpense = await riley.agent.get(`${ownBase}/expenses/${expense.body.expense.id}`);
    expect(viaExpense.status).toBe(404);
    expect(viaExpense.body.error.code).toBe("EXPENSE_NOT_FOUND");

    const viaChore = await riley.agent.post(
      `${ownBase}/chores/${chore.body.chore.id}/complete`
    );
    expect(viaChore.status).toBe(404);
    expect(viaChore.body.error.code).toBe("CHORE_NOT_FOUND");
  });
});
