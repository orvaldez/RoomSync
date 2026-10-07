import "dotenv/config";
import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl } from "./src/integration/test-database";

/**
 * Integration tests: the real app against a real PostgreSQL, with no mocked
 * repositories. Kept apart from `npm test` so the fast unit suite still runs
 * without a database. Run with `npm run test:integration`.
 */
const databaseUrl = resolveTestDatabaseUrl();

export default defineConfig({
  test: {
    include: ["src/integration/**/*.integration.test.ts"],
    globalSetup: ["src/integration/global-setup.ts"],
    env: {
      /**
       * Anything but `test`, so the session middleware uses the PostgreSQL
       * store the app runs with, not the in-memory one the unit tests use.
       */
      NODE_ENV: "integration",
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "test-only-secret-never-used-outside-vitest",
      // The flows register many users from one address; the rate limits
      // (#71) have their own tests, so they are set out of reach here.
      LOGIN_MAX_FAILURES_PER_EMAIL: "10000",
      LOGIN_MAX_FAILURES_PER_IP: "10000",
      REGISTER_MAX_PER_IP: "10000",
    },
    // One database, emptied before every test, so test files must not run at
    // the same time.
    fileParallelism: false,
    // Migrating a fresh database takes longer than the 10s default.
    hookTimeout: 60_000,
  },
});
