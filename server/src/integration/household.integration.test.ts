import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { getPrisma } from "../repositories/prisma";
import { resetDatabase } from "./test-database";
import { createHousehold, joinHousehold, signUp } from "./helpers";

/**
 * UC-03 and UC-04 end to end: create a household, invite a roommate, and have
 * them accept, against the real database.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

beforeEach(async () => {
  await resetDatabase(pool);
});

afterAll(async () => {
  await getPrisma().$disconnect();
  await pool.end();
});

describe("create a household, invite, accept, list the members", () => {
  it("runs the whole household flow against the database", async () => {
    const alex = await signUp("Alex");
    const sam = await signUp("Sam");

    const created = await alex.agent
      .post("/api/households")
      .send({ name: "Maple Street" });
    expect(created.status).toBe(201);
    expect(created.body.household).toMatchObject({
      name: "Maple Street",
      role: "OWNER",
    });
    const householdId = created.body.household.id;

    const invited = await alex.agent.post(
      `/api/households/${householdId}/invitations`
    );
    expect(invited.status).toBe(201);
    expect(invited.body.invitation.status).toBe("PENDING");
    const { token } = invited.body.invitation;

    // What Sam sees on the confirmation screen before accepting.
    const preview = await sam.agent.get(`/api/invitations/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.invitation.householdName).toBe("Maple Street");

    const accepted = await sam.agent.post(`/api/invitations/${token}/accept`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.household).toMatchObject({
      id: householdId,
      role: "MEMBER",
    });

    // Both members see the same list, oldest first.
    for (const viewer of [alex, sam]) {
      const members = await viewer.agent.get(
        `/api/households/${householdId}/members`
      );
      expect(members.status).toBe(200);
      expect(members.body.members).toMatchObject([
        { userId: alex.id, name: "Alex", role: "OWNER" },
        { userId: sam.id, name: "Sam", role: "MEMBER" },
      ]);
    }

    const current = await sam.agent.get("/api/households/current");
    expect(current.body.household).toMatchObject({ id: householdId });
  });

  it("uses each invitation once", async () => {
    const alex = await signUp("Alex");
    const sam = await signUp("Sam");
    const jo = await signUp("Jo");
    const householdId = await createHousehold(alex);

    const invited = await alex.agent.post(
      `/api/households/${householdId}/invitations`
    );
    const { token } = invited.body.invitation;
    await sam.agent.post(`/api/invitations/${token}/accept`);

    const { rows } = await pool.query<{ status: string }>(
      "SELECT status FROM invitations WHERE token = $1",
      [token]
    );
    expect(rows[0].status).toBe("ACCEPTED");

    const reused = await jo.agent.post(`/api/invitations/${token}/accept`);
    expect(reused.status).toBe(404);
    expect(reused.body.error.code).toBe("INVITATION_INVALID");
  });

  it("refuses an expired invitation", async () => {
    const alex = await signUp("Alex");
    const sam = await signUp("Sam");
    const householdId = await createHousehold(alex);

    const invited = await alex.agent.post(
      `/api/households/${householdId}/invitations`
    );
    const { token } = invited.body.invitation;
    await pool.query(
      "UPDATE invitations SET expires_at = NOW() - INTERVAL '1 minute' WHERE token = $1",
      [token]
    );

    const res = await sam.agent.post(`/api/invitations/${token}/accept`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("INVITATION_EXPIRED");
  });

  it("lets only the owner invite", async () => {
    const alex = await signUp("Alex");
    const sam = await signUp("Sam");
    const householdId = await createHousehold(alex);
    await joinHousehold(householdId, alex, sam);

    const res = await sam.agent.post(
      `/api/households/${householdId}/invitations`
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_HOUSEHOLD_OWNER");
  });

  it("keeps a user to one household", async () => {
    const alex = await signUp("Alex");
    const sam = await signUp("Sam");
    await createHousehold(alex);
    const samsHouseholdId = await createHousehold(sam, "Oak Avenue");

    const second = await alex.agent
      .post("/api/households")
      .send({ name: "Second place" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ALREADY_IN_HOUSEHOLD");

    const invited = await sam.agent.post(
      `/api/households/${samsHouseholdId}/invitations`
    );
    const joined = await alex.agent.post(
      `/api/invitations/${invited.body.invitation.token}/accept`
    );
    expect(joined.status).toBe(409);
    expect(joined.body.error.code).toBe("ALREADY_IN_HOUSEHOLD");
  });

  it("hides a household's members from anyone outside it", async () => {
    const alex = await signUp("Alex");
    const outsider = await signUp("Riley");
    const householdId = await createHousehold(alex);

    const res = await outsider.agent.get(
      `/api/households/${householdId}/members`
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("HOUSEHOLD_NOT_FOUND");
  });
});
