import { describe, expect, it } from "vitest";
import { signUp, threeRoommates, useCleanDatabase } from "./helpers";

/** UC-09 end to end: create, assign and complete chores against the database. */
const pool = useCleanDatabase();

describe("create a chore, and only its assignee completes it", () => {
  it("runs the whole chore flow against the database", async () => {
    const { householdId, alex, sam, maya } = await threeRoommates();

    const created = await alex.agent
      .post(`/api/households/${householdId}/chores`)
      .send({ title: "Take out the trash", assignedUserId: sam.id, dueDate: "2026-10-15" });
    expect(created.status).toBe(201);
    expect(created.body.chore).toMatchObject({
      title: "Take out the trash",
      assignee: { userId: sam.id, name: "Sam" },
      dueDate: "2026-10-15",
      isComplete: false,
      completedAt: null,
    });
    const choreId = created.body.chore.id;
    const complete = `/api/households/${householdId}/chores/${choreId}/complete`;

    // Neither another member nor the person who created it can complete it.
    for (const someoneElse of [maya, alex]) {
      const refused = await someoneElse.agent.post(complete);
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe("CHORE_NOT_ASSIGNED_TO_YOU");
    }
    const { rows: before } = await pool.query(
      "SELECT completed_at FROM chores WHERE chore_id = $1",
      [choreId]
    );
    expect(before[0].completed_at).toBeNull();

    const done = await sam.agent.post(complete);
    expect(done.status).toBe(200);
    expect(done.body.chore.isComplete).toBe(true);
    expect(done.body.chore.completedAt).toEqual(expect.any(String));

    // Completing again is harmless (UC-09 8a).
    expect((await sam.agent.post(complete)).status).toBe(200);

    const open = await alex.agent.get(`/api/households/${householdId}/chores?status=open`);
    const completed = await alex.agent.get(
      `/api/households/${householdId}/chores?status=completed`
    );
    expect(open.body.chores).toHaveLength(0);
    expect(completed.body.chores).toMatchObject([{ id: choreId, assignee: { name: "Sam" } }]);
  });

  it("refuses to assign a chore to someone outside the household", async () => {
    const { householdId, alex } = await threeRoommates();
    const riley = await signUp("Riley");

    const res = await alex.agent
      .post(`/api/households/${householdId}/chores`)
      .send({ title: "Mow the lawn", assignedUserId: riley.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ASSIGNEE_NOT_MEMBER");
  });
});
