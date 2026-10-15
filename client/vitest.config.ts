import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

/**
 * Test settings, merged over the Vite config so tests see the same plugins.
 * The coverage targets and why each is set where it is are in
 * docs/testing/coverage.md; change both together.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.{ts,tsx}"],
        reporter: ["text", "html", "json-summary"],
        thresholds: {
          // A floor at the baseline, not a target: almost no screen has a
          // test yet. Raised when the component tests (#76) land.
          statements: 6,
          branches: 75,
          functions: 45,
          lines: 6,
          // The logic a wrong answer costs money in: turning what a user
          // types into cents, and the direction of "you owe" / "owes you".
          // api.ts is the fetch wrapper, exercised by component tests.
          "src/lib/!(api).ts": {
            statements: 95,
            branches: 90,
            functions: 100,
            lines: 95,
          },
        },
      },
    },
  })
);
