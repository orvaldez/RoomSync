import { Pool } from "pg";

/**
 * The integration database. Defaults to `roomsync_test` in the Docker Compose
 * service, so a fresh clone needs no extra configuration; CI sets
 * TEST_DATABASE_URL to its own service container.
 */
const DEFAULT_TEST_DATABASE_URL =
  "postgresql://roomsync:roomsync@localhost:5432/roomsync_test?schema=public";

/**
 * Every test empties every table, so pointing this at the dev database would
 * wipe it. The name check makes that impossible rather than merely unlikely.
 */
export function resolveTestDatabaseUrl(
  url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL
): string {
  const name = new URL(url).pathname.slice(1);

  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against "${name}": every test ` +
        "empties the database, so its name must end in _test. Set " +
        "TEST_DATABASE_URL to a separate database."
    );
  }

  return url;
}

/**
 * Empties every application table, sessions included, but keeps Prisma's
 * migration history so the schema stays migrated.
 *
 * Uses `pg` directly rather than Prisma: this is test infrastructure, and only
 * repositories may use the Prisma client (ADR-001).
 */
export async function resetDatabase(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  );

  if (rows.length === 0) {
    return;
  }

  const tables = rows.map((row) => `"${row.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
