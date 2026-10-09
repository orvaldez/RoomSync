import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests need PostgreSQL and run separately, with
    // `npm run test:integration` (vitest.integration.config.ts).
    exclude: [...configDefaults.exclude, "src/integration/**"],
    /**
     * The app builds its session middleware at import time, which needs a
     * secret. Supplying it here keeps the test process from depending on a
     * local `.env`, so a fresh clone and CI both run `npm test` without one.
     *
     * NODE_ENV=test also selects the in-memory session store, so tests need
     * no PostgreSQL.
     */
    env: {
      NODE_ENV: "test",
      SESSION_SECRET: "test-only-secret-never-used-outside-vitest",
      // Every test file logs in and registers from one address, so the rate
      // limits (#71) are set out of reach. auth.rate-limit.test.ts sets its
      // own small ones.
      LOGIN_MAX_FAILURES_PER_EMAIL: "10000",
      LOGIN_MAX_FAILURES_PER_IP: "10000",
      REGISTER_MAX_PER_IP: "10000",
    },
  },
});
