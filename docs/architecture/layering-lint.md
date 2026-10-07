# Layering enforced by lint

ADR-001 splits the server into routes, services and repositories, and
`module-structure.md` §2 says what each layer may import. Until October 2026
those rules were checked by review and by grep commands run by hand, and a
route that imported Prisma still compiled. Since #69, `npm run lint` in
`server/` fails on any import that breaks them, and CI runs it on every pull
request (the `server` job), so a violation can't merge.

The rules live in [`server/eslint.config.mjs`](../../server/eslint.config.mjs)
as `no-restricted-imports` patterns, one block per layer.

## What fails the lint

| Where | May not import | Rule it enforces |
|---|---|---|
| Everywhere outside `src/repositories/` | `@prisma/client`, `.prisma/client`, `@prisma/adapter-pg`, `pg` | Only repositories touch the database (ADR-001) |
| Everywhere outside `src/middleware/session.ts` | `connect-pg-simple` | The session store has one documented home |
| `src/routes/` (not the route tests) | `repositories/` | Routes reach data through a service |
| `src/middleware/` | `repositories/` | Middleware reaches data through a service |
| `src/services/` | `express`, `express-session`, `routes/`, `middleware/` | Services never touch HTTP |
| `src/repositories/` | `services/`, `routes/` | Repositories never call upward |

Three exceptions are written into the config, each by path:

- **`src/middleware/session.ts`** may import `connect-pg-simple`, which
  manages its own `session` table. The reasoning is in
  [`server/src/repositories/README.md`](../../server/src/repositories/README.md).
- **Route tests** (`src/routes/**/*.test.ts`) may import repositories, because
  they mock them with `vi.mock` to run without a database. They never call the
  real ones.
- **`src/integration/`** may import `pg`, to create and empty the test
  database. It still may not import Prisma.

## Evidence

On October 7, 2026, a throwaway commit on a scratch branch made the health
route query the database through Prisma directly:

```diff
 import { Router, type Request, type Response } from "express";
+import { PrismaClient } from "@prisma/client";
+
+const prisma = new PrismaClient();

 const router = Router();

-router.get("/health", (_req: Request, res: Response) => {
+router.get("/health", async (_req: Request, res: Response) => {
+  await prisma.$queryRaw`SELECT 1`;
   res.status(200).json({ status: "ok", service: "roomsync-api" });
 });
```

`npm run typecheck` passed on that commit, which is the gap ADR-001 described:
the compiler has no opinion about layers. `npm run lint` failed:

```text
> server@1.0.0 lint
> eslint .


C:\Users\agust\RoomSync\server\src\routes\health.routes.ts
  2:1  error  '@prisma/client' import is restricted from being used by a pattern. Only src/repositories/ may use Prisma (ADR-001). Call a service, which calls a repository  no-restricted-imports

✖ 1 problem (1 error, 0 warnings)
```

The commit was then deleted. Every other row of the table was checked the same
way, by linting a one-line import under a path in that layer: each forbidden
import failed, and each of the three exceptions passed.

## What lint doesn't cover

Lint sees imports, not behavior. A service that receives `req` as an untyped
argument, or a client page that calls `fetch` directly, still needs the grep
checks in `module-structure.md` §3 and review.
