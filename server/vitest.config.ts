import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
    },
  },
});
