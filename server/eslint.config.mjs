import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

/**
 * The layering rules of ADR-001 and module-structure.md §2, as import
 * restrictions, so a build fails instead of a reviewer having to notice.
 *
 * In flat config a later block replaces a rule's options rather than merging
 * them, so each layer's block lists everything that layer may not import.
 */

// Only repositories talk to the database (repositories/README.md).
const PRISMA = {
  group: [
    "@prisma/client",
    "@prisma/client/**",
    ".prisma/client",
    ".prisma/client/**",
    "@prisma/adapter-pg",
  ],
  message:
    "Only src/repositories/ may use Prisma (ADR-001). Call a service, which calls a repository.",
};

const PG = {
  group: ["pg"],
  message:
    "Only src/repositories/ may run SQL (ADR-001). Add a repository function instead.",
};

// The documented exception: middleware/session.ts configures this library,
// which manages its own `session` table (repositories/README.md).
const SESSION_STORE = {
  group: ["connect-pg-simple"],
  message:
    "Only src/middleware/session.ts may configure the session store (repositories/README.md).",
};

const DATA_ACCESS = [PRISMA, PG, SESSION_STORE];

const REPOSITORIES = {
  group: ["**/repositories", "**/repositories/**"],
  message:
    "Routes and middleware reach data through a service, never a repository (module-structure.md §2).",
};

const restrict = (...patterns) => ["error", { patterns }];

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,mts,cts,js,mjs}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": restrict(...DATA_ACCESS),
    },
  },
  {
    files: ["src/routes/**/*.ts"],
    ignores: ["src/routes/**/*.test.ts"],
    rules: {
      "no-restricted-imports": restrict(...DATA_ACCESS, REPOSITORIES),
    },
  },
  {
    files: ["src/services/**/*.ts"],
    rules: {
      "no-restricted-imports": restrict(...DATA_ACCESS, {
        group: [
          "express",
          "express-session",
          "**/routes",
          "**/routes/**",
          "**/middleware",
          "**/middleware/**",
        ],
        message:
          "Services never touch HTTP: no Express, routes or middleware (module-structure.md §2).",
      }),
    },
  },
  {
    files: ["src/middleware/**/*.ts"],
    rules: {
      "no-restricted-imports": restrict(...DATA_ACCESS, REPOSITORIES),
    },
  },
  {
    files: ["src/middleware/session.ts"],
    rules: {
      "no-restricted-imports": restrict(PRISMA, PG, REPOSITORIES),
    },
  },
  {
    files: ["src/repositories/**/*.ts"],
    rules: {
      "no-restricted-imports": restrict({
        group: ["**/services", "**/services/**", "**/routes", "**/routes/**"],
        message:
          "Repositories never call upward into services or routes (module-structure.md §2).",
      }),
    },
  },
  {
    // Test infrastructure: creates and empties the test database with `pg`,
    // and never touches application data through it.
    files: ["src/integration/**/*.ts"],
    rules: {
      "no-restricted-imports": restrict(PRISMA, SESSION_STORE),
    },
  },
]);
