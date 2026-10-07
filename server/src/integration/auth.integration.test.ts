import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import app from "../app";
import { getPrisma } from "../repositories/prisma";
import { resetDatabase } from "./test-database";

/**
 * UC-01 and UC-02 end to end: real routes, services, repositories, SQL, and
 * the PostgreSQL session store, with a real session cookie. Nothing is mocked.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ORLANDO = {
  name: "Orlando",
  email: "orlando@crimson.ua.edu",
  password: "correct-horse",
};

beforeEach(async () => {
  await resetDatabase(pool);
});

afterAll(async () => {
  await getPrisma().$disconnect();
  await pool.end();
});

async function countSessions(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM session"
  );
  return Number(rows[0].count);
}

describe("register, log in, check the session, log out", () => {
  it("runs the whole account flow against the database", async () => {
    const agent = request.agent(app);

    const registered = await agent.post("/api/auth/register").send(ORLANDO);
    expect(registered.status).toBe(201);
    expect(registered.body.user).toMatchObject({
      name: ORLANDO.name,
      email: ORLANDO.email,
    });

    // Registration doesn't log in (UC-01 step 7).
    expect((await agent.get("/api/auth/me")).status).toBe(401);
    expect(await countSessions()).toBe(0);

    const loggedIn = await agent
      .post("/api/auth/login")
      .send({ email: ORLANDO.email, password: ORLANDO.password });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.headers["set-cookie"]?.[0]).toMatch(/^roomsync\.sid=/);

    // The session lives in PostgreSQL, not in the process.
    expect(await countSessions()).toBe(1);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      id: registered.body.user.id,
      email: ORLANDO.email,
    });

    const loggedOut = await agent.post("/api/auth/logout");
    expect(loggedOut.status).toBe(204);
    expect(await countSessions()).toBe(0);

    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("stores a bcrypt hash, never the password", async () => {
    await request(app).post("/api/auth/register").send(ORLANDO);

    const { rows } = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE email = $1",
      [ORLANDO.email]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    expect(rows[0].password_hash).not.toContain(ORLANDO.password);
  });

  it("refuses a second account with the same email through the unique index", async () => {
    await request(app).post("/api/auth/register").send(ORLANDO);

    const again = await request(app)
      .post("/api/auth/register")
      .send({ ...ORLANDO, name: "Someone else" });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("EMAIL_UNAVAILABLE");
  });

  it("refuses a wrong password without creating a session", async () => {
    await request(app).post("/api/auth/register").send(ORLANDO);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ORLANDO.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(await countSessions()).toBe(0);
  });
});
