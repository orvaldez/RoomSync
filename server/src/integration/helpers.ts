import request from "supertest";
import { expect } from "vitest";
import app from "../app";

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
