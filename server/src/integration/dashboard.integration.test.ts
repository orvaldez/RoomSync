import { describe, expect, it } from "vitest";
import { threeRoommates, useCleanDatabase } from "./helpers";

/**
 * UC-10 end to end: after an expense, a settlement and a completed chore, the
 * dashboard's single request reflects all of them.
 */
useCleanDatabase();

describe("the dashboard reflects the household's activity", () => {
  it("starts empty", async () => {
    const { householdId, sam } = await threeRoommates();

    const res = await sam.agent.get(`/api/households/${householdId}/dashboard`);

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(3);
    expect(res.body.upcomingChores).toEqual([]);
    expect(res.body.recentActivity).toEqual([]);
    expect(res.body.balances.totals).toEqual({ youOweCents: 0, owedToYouCents: 0 });
  });

  it("shows balances, Sam's open chores, and the activity, newest first", async () => {
    const { householdId, alex, sam, maya } = await threeRoommates();
    const base = `/api/households/${householdId}`;

    // Alex pays $90.00 split equally three ways: 3000 each.
    expect(
      (
        await alex.agent.post(`${base}/expenses`).send({
          description: "Electricity",
          totalAmountCents: 9000,
          expenseDate: "2026-10-01",
          paidByUserId: alex.id,
          splitMethod: "EQUAL",
          participants: [{ userId: alex.id }, { userId: sam.id }, { userId: maya.id }],
        })
      ).status
    ).toBe(201);

    // Sam pays Alex back 1000 of the 3000, leaving 2000.
    expect(
      (
        await sam.agent
          .post(`${base}/settlements`)
          .send({ fromUserId: sam.id, toUserId: alex.id, amountCents: 1000 })
      ).status
    ).toBe(201);

    // Two chores for Sam; Sam completes the first.
    const dishes = await alex.agent
      .post(`${base}/chores`)
      .send({ title: "Dishes", assignedUserId: sam.id, dueDate: "2026-10-10" });
    await alex.agent
      .post(`${base}/chores`)
      .send({ title: "Vacuum", assignedUserId: sam.id, dueDate: "2026-10-20" });
    await alex.agent
      .post(`${base}/chores`)
      .send({ title: "Laundry", assignedUserId: maya.id, dueDate: "2026-10-12" });
    expect(
      (await sam.agent.post(`${base}/chores/${dishes.body.chore.id}/complete`)).status
    ).toBe(200);

    const res = await sam.agent.get(`${base}/dashboard`);
    expect(res.status).toBe(200);
    const dashboard = res.body;

    expect(dashboard.household).toMatchObject({ id: householdId, role: "MEMBER" });
    expect(dashboard.members.map((m: { name: string }) => m.name)).toEqual([
      "Alex",
      "Sam",
      "Maya",
    ]);

    // From Sam's side: Sam owes Alex 2000, and Maya owes Sam nothing.
    expect(dashboard.balances.totals).toEqual({ youOweCents: 2000, owedToYouCents: 0 });
    const net = Object.fromEntries(
      dashboard.balances.balances.map((b: { name: string; netCents: number }) => [
        b.name,
        b.netCents,
      ])
    );
    expect(net).toEqual({ Alex: -2000, Maya: 0 });

    // Only Sam's open chores, not the completed one or Maya's.
    expect(dashboard.upcomingChores.map((c: { title: string }) => c.title)).toEqual([
      "Vacuum",
    ]);

    // Newest first: the completed chore, the settlement, the expense.
    expect(dashboard.recentActivity.map((a: { type: string }) => a.type)).toEqual([
      "CHORE_COMPLETED",
      "SETTLEMENT",
      "EXPENSE",
    ]);
    expect(dashboard.recentActivity[0].chore.title).toBe("Dishes");
    expect(dashboard.recentActivity[1].settlement.amountCents).toBe(1000);
    expect(dashboard.recentActivity[2].expense.description).toBe("Electricity");
  });
});
