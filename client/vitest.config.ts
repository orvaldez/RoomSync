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
      // Component tests (#76) render into a simulated DOM; the lib tests
      // stay in plain Node, where they run faster.
      environmentMatchGlobs: [["src/**/*.test.tsx", "jsdom"]],
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
        reporter: ["text", "html", "json-summary"],
        thresholds: {
          // A floor just under the level the component tests (#76, then
          // History, the expense detail and editing) brought it to, so it can
          // only go up. Several screens still have no test.
          statements: 65,
          branches: 78,
          functions: 60,
          lines: 65,
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
