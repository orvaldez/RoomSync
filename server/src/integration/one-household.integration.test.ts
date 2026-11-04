import { describe, expect, it } from "vitest";
import { createHousehold, signUp, useCleanDatabase, type SignedInUser } from "./helpers";

/**
 * #73: one household per user holds under concurrent requests.
 *
 * The rule is checked and then written, so two requests for the same user
 * arriving together could both pass the check before either wrote. Each case
 * fires both requests at once, several times over with fresh users, and
 * requires exactly one to succeed, the other to get 409 ALREADY_IN_HOUSEHOLD,
 * and the database to hold exactly one membership for the user.
 */
const pool = useCleanDatabase();

/** How many times each race is run; one lost race is enough to fail. */
const ROUNDS = 5;

/**
 * Each test runs ROUNDS rounds of real sign-ups (bcrypt on every register and
 * login), so it takes seconds, not milliseconds: the slowest measured 5.3 s
 * on a busy laptop, past Vitest's 5 s default. A timed-out test also keeps
 * running in the background, so its later sign-ups collide with the next
 * test's users (409 on register) and fail that one too. 30 s is about six
 * times the slowest run seen, and still catches a real hang.
 */
const RACE_TIMEOUT_MS = 30_000;

type Response = { status: number; body: { error?: { code?: string } } };

async function membershipsOf(user: SignedInUser): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM memberships WHERE user_id = $1",
    [user.id]
  );
  return Number(rows[0].count);
}

async function invitationFrom(owner: SignedInUser, householdId: string): Promise<string> {
  const res = await owner.agent.post(`/api/households/${householdId}/invitations`);
  expect(res.status).toBe(201);
  return res.body.invitation.token;
}

/** Exactly one request succeeded and the other got 409 ALREADY_IN_HOUSEHOLD. */
function expectOneWinner(results: Response[]) {
  const outcomes = results.map((r) => (r.status < 300 ? "success" : `${r.status} ${r.body.error?.code}`));
  expect(outcomes.sort()).toEqual(["409 ALREADY_IN_HOUSEHOLD", "success"]);
}

describe("one household per user, under concurrent requests (#73)", () => {
  it("lets only one of two simultaneous household creations through", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const jo = await signUp(`Jo${round}`);

      const results = await Promise.all([
        jo.agent.post("/api/households").send({ name: "First" }),
        jo.agent.post("/api/households").send({ name: "Second" }),
      ]);

      expectOneWinner(results);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await membershipsOf(jo)).toBe(1);
    }
  }, RACE_TIMEOUT_MS);

  it("lets only one of two invitations accepted at the same moment through", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const alex = await signUp(`Alex${round}`);
      const sam = await signUp(`Sam${round}`);
      const jo = await signUp(`Jo${round}`);
      const first = await invitationFrom(alex, await createHousehold(alex, "Maple Street"));
      const second = await invitationFrom(sam, await createHousehold(sam, "Oak Avenue"));

      const results = await Promise.all([
        jo.agent.post(`/api/invitations/${first}/accept`),
        jo.agent.post(`/api/invitations/${second}/accept`),
      ]);

      expectOneWinner(results);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await membershipsOf(jo)).toBe(1);

      // The losing invitation was not used up, so it can still be given to someone else.
      const { rows } = await pool.query<{ status: string }>(
        "SELECT status FROM invitations WHERE token = ANY($1)",
        [[first, second]]
      );
      expect(rows.map((r) => r.status).sort()).toEqual(["ACCEPTED", "PENDING"]);
    }
  }, RACE_TIMEOUT_MS);

  it("lets only one of a creation and an acceptance at the same moment through", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const alex = await signUp(`Alex${round}`);
      const jo = await signUp(`Jo${round}`);
      const token = await invitationFrom(alex, await createHousehold(alex, "Maple Street"));

      const results = await Promise.all([
        jo.agent.post("/api/households").send({ name: "Jo's place" }),
        jo.agent.post(`/api/invitations/${token}/accept`),
      ]);

      expectOneWinner(results);
      expect(await membershipsOf(jo)).toBe(1);
    }
  }, RACE_TIMEOUT_MS);
});
