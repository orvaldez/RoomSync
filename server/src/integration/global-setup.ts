import { execSync } from "node:child_process";
import { Client } from "pg";
import { resolveTestDatabaseUrl } from "./test-database";

/**
 * Runs once before the integration suite: creates the test database if it
 * doesn't exist yet, then applies every migration with `prisma migrate deploy`,
 * the same command a deployment uses. The dev database is never touched.
 */
export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl();

  await createDatabaseIfMissing(url);

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}

/**
 * Docker Compose only creates the database named in `docker-compose.yml`, and
 * only on a new volume, so an existing local setup has no `roomsync_test`.
 */
async function createDatabaseIfMissing(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.slice(1);

  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  maintenance.search = "";

  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();

  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name]
    );

    if (rowCount === 0) {
      // Identifiers can't be query parameters. `name` already passed the
      // `_test` check; quoting keeps it a single identifier.
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}
