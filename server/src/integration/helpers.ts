import request from "supertest";
import { Pool } from "pg";
import { afterAll, beforeEach, expect } from "vitest";
import app from "../app";
import { getPrisma } from "../repositories/prisma";
import { resetDatabase } from "./test-database";

/** A logged-in user: a Supertest agent holding their session cookie. */
export interface SignedInUser {
  id: string;
  name: string;
  agent: ReturnType<typeof request.agent>;
}

/**
 * Registers a user and logs them in through the real endpoints, the way a
 * person would. Every flow after the account flow starts from here.
 */
export async function signUp(name: string): Promise<SignedInUser> {
  const email = `${name.toLowerCase()}@crimson.ua.edu`;
  const password = "correct-horse";
  const agent = request.agent(app);

  const registered = await agent
    .post("/api/auth/register")
    .send({ name, email, password });
  expect(registered.status).toBe(201);

  const loggedIn = await agent
    .post("/api/auth/login")
    .send({ email, password });
  expect(loggedIn.status).toBe(200);

  return { id: registered.body.user.id, name, agent };
}

/** Creates a household owned by `owner` and returns its id. */
export async function createHousehold(
  owner: SignedInUser,
  name = "Maple Street"
): Promise<string> {
  const res = await owner.agent.post("/api/households").send({ name });
  expect(res.status).toBe(201);
  return res.body.household.id;
}

/** The owner invites, and `member` accepts the link. */
export async function joinHousehold(
  householdId: string,
  owner: SignedInUser,
  member: SignedInUser
): Promise<void> {
  const invited = await owner.agent.post(
    `/api/households/${householdId}/invitations`
  );
  expect(invited.status).toBe(201);

  const accepted = await member.agent.post(
    `/api/invitations/${invited.body.invitation.token}/accept`
  );
  expect(accepted.status).toBe(200);
}

/**
 * Empties the database before each test in the calling file and closes its
 * connections afterwards. Returns a `pg` pool for checking rows directly.
 */
export function useCleanDatabase(): Pool {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await getPrisma().$disconnect();
    await pool.end();
  });

  return pool;
}

/** A household of Alex (owner), Sam and Maya, the cast of the money flows. */
export async function threeRoommates(): Promise<{
  householdId: string;
  alex: SignedInUser;
  sam: SignedInUser;
  maya: SignedInUser;
}> {
  const alex = await signUp("Alex");
  const sam = await signUp("Sam");
  const maya = await signUp("Maya");
  const householdId = await createHousehold(alex);
  await joinHousehold(householdId, alex, sam);
  await joinHousehold(householdId, alex, maya);
  return { householdId, alex, sam, maya };
}

/** `viewer`'s balances as `{ name: netCents }`, from GET .../balances. */
export async function balancesOf(
  viewer: SignedInUser,
  householdId: string
): Promise<{ net: Record<string, number>; totals: Record<string, number> }> {
  const res = await viewer.agent.get(`/api/households/${householdId}/balances`);
  expect(res.status).toBe(200);
  const net: Record<string, number> = {};
  for (const balance of res.body.balances) {
    net[balance.name] = balance.netCents;
  }
  return { net, totals: res.body.totals };
}
