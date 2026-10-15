# Test coverage

How much of the code the unit tests run, what each area is expected to reach,
and why. Tracked in #62. Coverage is measured with Vitest's V8 provider
(`@vitest/coverage-v8`, on the same 2.1.9 line as Vitest itself; see
[`docs/security/dependency-audit.md`](../security/dependency-audit.md)).

## Generating the report

```bash
cd server && npx prisma generate && npm run test:coverage
cd client && npm run test:coverage
```

Each prints a table and writes an HTML report to `coverage/index.html` in that
workspace (git-ignored). CI runs the same command in the `server` and `client`
jobs and uploads each report as a workflow artifact (`coverage-server`,
`coverage-client`), kept for 30 days.

The targets below are thresholds in `server/vitest.config.ts` and
`client/vitest.config.ts`. Falling below any of them fails the run, and so
fails the required CI check. A target changes only in the same pull request as
this file.

## Baseline

Unit tests only (`npm run test:coverage`). Later milestones add a row per
measurement, so the trend stays visible.

### Server

| Date | Commit | Area | Statements | Branches | Functions | Lines |
|---|---|---|---|---|---|---|
| 2026-10-12 | `963dd2e` | **All files** | 74.53% | 94.52% | 80.33% | 74.53% |
| | | `src/services/` | 99.28% | 98.36% | 100% | 99.28% |
| | | `src/routes/` | 100% | 87.72% | 100% | 100% |
| | | `src/middleware/` | 86.03% | 80.36% | 100% | 86.03% |
| | | `src/repositories/` | 9.01% | 100% | 8.11% | 9.01% |
| | | `src/*.ts` (app, entry point, seed) | 47.84% | 72.73% | 71.43% | 47.84% |

423 tests.

### Client

| Date | Commit | Area | Statements | Branches | Functions | Lines |
|---|---|---|---|---|---|---|
| 2026-10-12 | `963dd2e` | **All files** | 6.95% | 77.27% | 47.22% | 6.95% |
| | | `src/lib/` except `api.ts` | 100% | 98.51% | 100% | 100% |
| | | `src/lib/api.ts` | 0% | 100% | 100% | 0% |
| | | Pages, components, auth, `App.tsx` | 0% | 5% | 5% | 0% |

91 tests.

## Targets, and why

One global number would hide what matters. A bug in the split arithmetic
moves money between roommates; a bug in a page's layout is visible the moment
someone looks. So the bar is highest where a wrong answer is silent and costs
money (SC-04), and lowest where a person or a different kind of test catches
the failure.

| Area | Target (statements / branches / functions / lines) | Why |
|---|---|---|
| `server/src/services/` | 95 / 90 / 95 / 95 | The business rules: splitting, balances, settlements, membership, chores. The split and balance arithmetic is where a mistake is silent and moves money, so this is the highest bar. The baseline is already above it, and the target keeps it there. The 5% margin leaves room for defensive branches that can't be reached through the public functions |
| `server/src/routes/` | 95 / 80 / 95 / 95 | The HTTP contract: status codes and error codes the client depends on. Every route already has Supertest tests. Branches are lower because the session-callback wrappers (`regenerate`, `save`, `destroy`) have error paths that only a failing session store reaches |
| `server/src/middleware/` | 80 / 75 / 90 / 80 | Authentication, membership, rate limiting and error handling are tested. What's left is mostly session setup: the PostgreSQL store, which unit tests replace with the in-memory one (the integration tests run the real one), and the startup checks that refuse a missing or example `SESSION_SECRET`. The rest are guards against programmer error, such as calling `currentUserId` on a route without `requireAuth` |
| `server/src/repositories/` | No unit target | Mocked in every unit test by design (ADR-001): a repository is a thin layer over Prisma, and the only useful test of it runs real SQL. The integration tests (#61) do that against PostgreSQL. Their coverage isn't measured yet; adding it is a Milestone 3 metric |
| `server/src/*.ts` | No separate target | `index.ts` starts the server and `seed.ts` is a CLI script; both are run by hand and in the README verification steps. `seed-data.ts`, the data the seed writes, has its own tests |
| Server, all files | 70 / 90 / 75 / 70 | A floor just under the baseline, so overall coverage can't quietly fall. The repositories pull the statement and line numbers down, which is why the floor is 70 and not higher |
| `client/src/lib/` except `api.ts` | 95 / 90 / 100 / 95 | Turning what a user types into integer cents (`money.ts`), and the direction of every "you owe" and "owes you" sentence (`balances.ts`, `activity.ts`, `chores.ts`). These are the client's SC-04 equivalent: a wrong answer looks plausible. Every exported function must have a test |
| `client/src/lib/api.ts` | No separate target | The `fetch` wrapper. Its behavior is the server's contract, already tested on the server side, and component tests (#76) exercise it from the screens |
| Client pages and components | None yet | No screen has a test today. The component tests (#76, Sprint 4) add them, and that PR sets the target |
| Client, all files | 6 / 75 / 45 / 6 | A floor at the baseline, not a goal, so the number can only go up. It is raised when #76 lands |

### What the numbers don't say

Coverage shows which lines ran, not whether the tests checked the right
answer. A test that calls `splitEqually` without asserting the result still
counts. The services' tests assert exact cent amounts, including the
remainder-cent cases, which is what makes their high coverage meaningful. When
reviewing a test, check its assertions, not just the coverage it adds.
