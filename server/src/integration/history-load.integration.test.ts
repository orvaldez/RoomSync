import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { getPrisma } from "../repositories/prisma";
import { resetDatabase } from "./test-database";
import { createHousehold, joinHousehold, signUp } from "./helpers";

/**
 * NFR-02 for the History screen (UC-11): a household of five with 500
 * expenses, the size the requirement names, still answers in under two
 * seconds. The lists aren't paginated, so this is the evidence that they
 * don't need to be yet. The measured times are recorded in the product brief.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const EXPENSES = 500;
const BUDGET_MS = 2000;

beforeEach(async () => {
  await resetDatabase(pool);
});

afterAll(async () => {
  await getPrisma().$disconnect();
  await pool.end();
});

/** Elapsed wall-clock time for one request, in milliseconds. */
async function timed<T>(run: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await run();
  return { result, ms: performance.now() - start };
}

describe("History with 500 expenses (NFR-02)", () => {
  it("answers each list and the dashboard in under two seconds", async () => {
    const members = [];
    for (const name of ["Alex", "Sam", "Maya", "Jo", "Riley"]) {
      members.push(await signUp(name));
    }
    const [alex, ...others] = members;
    const householdId = await createHousehold(alex);
    for (const member of others) {
      await joinHousehold(householdId, alex, member);
    }

    // Written in two statements rather than 500 requests, to keep the setup
    // fast: each expense is $50.00 split equally five ways, 1000 each, with
    // the payer rotating and one date per day going back from Oct 1.
    const ids = members.map((member) => member.id);
    await pool.query(
      `INSERT INTO expenses (expense_id, household_id, description, total_amount_cents,
                             paid_by_user_id, split_method, expense_date)
       SELECT 'load-' || n, $1, 'Expense ' || n, 5000,
              ($2::text[])[1 + n % 5], 'EQUAL', DATE '2026-10-01' - n
       FROM generate_series(1, $3::int) AS n`,
      [householdId, ids, EXPENSES]
    );
    await pool.query(
      `INSERT INTO expense_shares (expense_share_id, expense_id, user_id, amount_owed_cents)
       SELECT 'load-' || n || '-' || m, 'load-' || n, ($1::text[])[m], 1000
       FROM generate_series(1, $2::int) AS n, generate_series(1, 5) AS m`,
      [ids, EXPENSES]
    );

    const base = `/api/households/${householdId}`;
    const timings: Record<string, number> = {};

    for (const [name, path] of [
      ["expenses", `${base}/expenses`],
      ["settlements", `${base}/settlements`],
      ["completed chores", `${base}/chores?status=completed`],
      ["dashboard", `${base}/dashboard`],
      ["balances", `${base}/balances`],
    ] as const) {
      // Once to warm the connection pool and Prisma's query plans, then the
      // measured request, as a user's second visit would be.
      await alex.agent.get(path);
      const { result, ms } = await timed(() => alex.agent.get(path));
      expect(result.status).toBe(200);
      timings[name] = Math.round(ms);
      expect(ms, `${name} took ${Math.round(ms)}ms`).toBeLessThan(BUDGET_MS);
    }

    const list = await alex.agent.get(`${base}/expenses`);
    expect(list.body.expenses).toHaveLength(EXPENSES);
    expect(list.body.expenses[0].expenseDate).toBe("2026-09-30");

    // Every member paid 100 expenses and owes 1000 on each of the other 400:
    // pairwise that nets to zero, which checks the 500 rows were all read.
    const balances = await alex.agent.get(`${base}/balances`);
    expect(balances.body.totals).toEqual({ youOweCents: 0, owedToYouCents: 0 });

    console.log(`NFR-02, ${EXPENSES} expenses, 5 members:`, timings);
  });
});
