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

describe("revoke an invitation (UC-14)", () => {
  it("lists only live invitations, and a revoked link stops working", async () => {
    const alex = await signUp("Alex");
    const sam = await signUp("Sam");
    const jo = await signUp("Jo");
    const householdId = await createHousehold(alex);
    const base = `/api/households/${householdId}/invitations`;

    // One accepted, one expired, and two still pending.
    const accepted = (await alex.agent.post(base)).body.invitation;
    await sam.agent.post(`/api/invitations/${accepted.token}/accept`);
    const expired = (await alex.agent.post(base)).body.invitation;
    await pool.query(
      "UPDATE invitations SET expires_at = NOW() - INTERVAL '1 minute' WHERE invitation_id = $1",
      [expired.id]
    );
    const older = (await alex.agent.post(base)).body.invitation;
    const newer = (await alex.agent.post(base)).body.invitation;

    const listed = await alex.agent.get(base);
    expect(listed.status).toBe(200);
    expect(listed.body.invitations.map((i: { id: string }) => i.id)).toEqual([
      newer.id,
      older.id,
    ]);

    const revoked = await alex.agent.post(`${base}/${older.id}/revoke`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.invitation).toMatchObject({ id: older.id, status: "REVOKED" });

    const { rows } = await pool.query<{ status: string }>(
      "SELECT status FROM invitations WHERE invitation_id = $1",
      [older.id]
    );
    expect(rows[0].status).toBe("REVOKED");

    // The revoked link answers exactly like one that never existed.
    const preview = await jo.agent.get(`/api/invitations/${older.token}`);
    expect(preview.status).toBe(404);
    expect(preview.body.error.code).toBe("INVITATION_INVALID");
    const accept = await jo.agent.post(`/api/invitations/${older.token}/accept`);
    expect(accept.status).toBe(404);
    expect(accept.body.error.code).toBe("INVITATION_INVALID");

    const after = await alex.agent.get(base);
    expect(after.body.invitations.map((i: { id: string }) => i.id)).toEqual([newer.id]);

    // The other link still works.
    const joined = await jo.agent.post(`/api/invitations/${newer.token}/accept`);
    expect(joined.status).toBe(200);
  });

  it("refuses to revoke an invitation that is no longer pending", async () => {
    const alex = await signUp("Alex");
    const sam = await signUp("Sam");
    const householdId = await createHousehold(alex);
    const base = `/api/households/${householdId}/invitations`;

    const used = (await alex.agent.post(base)).body.invitation;
    await sam.agent.post(`/api/invitations/${used.token}/accept`);
    const twice = (await alex.agent.post(base)).body.invitation;
    await alex.agent.post(`${base}/${twice.id}/revoke`);

    for (const id of [used.id, twice.id]) {
      const res = await alex.agent.post(`${base}/${id}/revoke`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVITATION_NOT_PENDING");
    }

    const { rows } = await pool.query<{ status: string }>(
      "SELECT status FROM invitations WHERE invitation_id = $1",
      [used.id]
    );
    expect(rows[0].status).toBe("ACCEPTED");
  });

  it("lets only the owner list or revoke, and only their own household's", async () => {
    const alex = await signUp("Alex");
    const sam = await signUp("Sam");
    const riley = await signUp("Riley");
    const householdId = await createHousehold(alex);
    await joinHousehold(householdId, alex, sam);
    const rileysHouseholdId = await createHousehold(riley, "Oak Avenue");
    const base = `/api/households/${householdId}/invitations`;
    const pending = (await alex.agent.post(base)).body.invitation;

    const memberList = await sam.agent.get(base);
    expect(memberList.status).toBe(403);
    expect(memberList.body.error.code).toBe("NOT_HOUSEHOLD_OWNER");
    const memberRevoke = await sam.agent.post(`${base}/${pending.id}/revoke`);
    expect(memberRevoke.status).toBe(403);
    expect(memberRevoke.body.error.code).toBe("NOT_HOUSEHOLD_OWNER");

    const outsiderRevoke = await riley.agent.post(`${base}/${pending.id}/revoke`);
    expect(outsiderRevoke.status).toBe(404);
    expect(outsiderRevoke.body.error.code).toBe("HOUSEHOLD_NOT_FOUND");

    // Riley owns a household, but the id belongs to Alex's.
    const viaOwn = await riley.agent.post(
      `/api/households/${rileysHouseholdId}/invitations/${pending.id}/revoke`
    );
    expect(viaOwn.status).toBe(404);
    expect(viaOwn.body.error.code).toBe("INVITATION_NOT_FOUND");

    const { rows } = await pool.query<{ status: string }>(
      "SELECT status FROM invitations WHERE invitation_id = $1",
      [pending.id]
    );
    expect(rows[0].status).toBe("PENDING");
  });
});
