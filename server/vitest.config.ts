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
    /**
     * Unit-test coverage, with `npm run test:coverage`. The targets and why
     * each area's is set where it is are in docs/testing/coverage.md; change
     * both together.
     */
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/integration/**"],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        // A floor just under the baseline, so coverage can't quietly fall.
        // Repositories are mocked here by design and pull this down; the
        // integration tests cover them.
        statements: 70,
        branches: 90,
        functions: 75,
        lines: 70,
        // The business rules, including the split and balance arithmetic
        // (SC-04): the highest bar.
        "src/services/**": {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        "src/routes/**": {
          statements: 95,
          branches: 80,
          functions: 95,
          lines: 95,
        },
        "src/middleware/**": {
          statements: 80,
          branches: 75,
          functions: 90,
          lines: 80,
        },
      },
    },
  },
});
