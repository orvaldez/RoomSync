# Quality-assurance plan

How RoomSync is tested: what each level of testing checks, who runs it, and
when. It also sets the entry and exit criteria for a milestone, the manual
checklist before a release, and how a defect is handled. Tracked in #63.

The day-to-day rules for branches, pull requests and review are in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md); this plan doesn't repeat them. The
pull request template ([`.github/pull_request_template.md`](../../.github/pull_request_template.md))
is where this plan reaches every PR: its checklist is the "every PR" column
below, in a form the author ticks.

## 1. Levels of testing

| Level | What it checks | Tool | Where it lives | Runs automatically |
|---|---|---|---|---|
| **Static checks** | Types; lint rules, including the ADR-001 layering (only repositories touch the database, services never import Express); the client build | `tsc`, ESLint, Vite | `server/eslint.config.mjs`, `client/eslint.config.js` | Every PR, in CI |
| **Server unit tests** | Services (the business rules, including the split and balance arithmetic), routes (status and error codes from the API contract) and middleware, with repositories mocked so no database is needed | Vitest, Supertest | `server/src/**/*.test.ts` | Every PR, in CI (`server` job) |
| **Client unit tests** | The logic in `client/src/lib/`: turning typed amounts into cents, and the wording of balances, chores, activity and history | Vitest | `client/src/lib/*.test.ts` | Every PR, in CI (`client` job) |
| **Coverage** | That the unit tests keep reaching the code they're meant to, with a target per area | `@vitest/coverage-v8` | Thresholds in each `vitest.config.ts`; [`coverage.md`](./coverage.md) | Every PR, in CI. Below a target fails the job |
| **Integration tests** | The main user flows through the real app and real PostgreSQL, nothing mocked: account, household and invitations, expenses and balances, settlements, chores, the dashboard, 404 for outsiders, and NFR-02 with 500 expenses | Vitest, Supertest, PostgreSQL | `server/src/integration/` | Every PR, in CI (`integration` job) |
| **Component tests** | Screens render each state (loading, empty, error, ready) and respond to input | React Testing Library | Planned in #76 (Sprint 4) | Every PR, in CI, once they exist |
| **Cross-viewport and device testing** | Every screen at 375px and 1280px with no horizontal scroll, and on real phones | Headless Edge script, then real devices | [`responsive-design.md`](../design/responsive-design.md) §5; real devices in #66 (Sprint 4) | No. Run by hand (§2) |
| **Manual walkthrough** | The whole app from a clean clone, as a TA would run it | The README's Getting started and Verifying sections | §4 below | No. Run by hand before a release |
| **Security checks** | The threat model's controls still hold; new dependencies are audited | `npm audit`, the rate-limit evidence script | [`threat-model.md`](../security/threat-model.md), [`dependency-audit.md`](../security/dependency-audit.md), [`rate-limiting.md`](../security/rate-limiting.md) | No. Run when a dependency is added, and before a milestone |

Why these levels: the unit tests are fast and catch most mistakes in the
arithmetic and the API contract, but they mock the database, so the
integration tests exist to catch what only real SQL shows (a missing join,
an ordering, a transaction). Neither renders a screen, which is why the
cross-viewport check and the walkthrough stay manual until the component tests
arrive.

## 2. Who runs what, and when

The team is two people, so "who" is the author of a change, its reviewer, or
both of us together.

| When | What runs | Who |
|---|---|---|
| **Before pushing** | The CI commands for the workspace changed (`CONTRIBUTING.md`, Before you push), plus the integration tests if the server changed | Author |
| **Every pull request** | All three CI jobs, automatically; they are required checks, so a red one blocks the merge. The PR template's checklist | CI; the author ticks the checklist |
| **Every review** | The PR against its issue's acceptance criteria and the Definition of Done; screenshots for a UI change; the changed code paths have tests | Reviewer |
| **A change to layout or a new screen** | That screen at 375px and 1280px: no horizontal scroll, and a screenshot in `docs/design/screenshots/` | Author, checked by the reviewer |
| **Adding a dependency** | `npm audit` before and after, recorded in `dependency-audit.md` | Author |
| **Every release** (`v0.x` tag, `CHANGELOG.md`) | The pre-release checklist in §4 on a clean clone, and the dependency audit | The member tagging the release, with the other reviewing the result |
| **Before a milestone submission** | The exit criteria in §3, all of them | Both |

## 3. Entry and exit criteria for a milestone

**Entry**, before a milestone's work starts:

- Every piece of the milestone's work is an issue with acceptance criteria, a
  priority, an owner, a sprint and a target date (`BACKLOG.md`, the Sprint
  plan).
- `main` is green: all three CI checks pass on its latest commit.
- The previous milestone's submission is tagged.

**Exit**, before the milestone is submitted:

- Every P0 issue in the milestone is closed, with each acceptance-criteria box
  ticked. P1 work not done by October 31 moves to the next milestone rather
  than holding up the submission (`BACKLOG.md`, working rules).
- All three CI checks pass on the commit being submitted, coverage targets
  included.
- No open issue labelled `bug` and `P0` (§5).
- The pre-release checklist in §4 passes on a clean clone of that commit.
- The dependency audit has a dated entry for the milestone.
- The README, `CHANGELOG.md` and the docs this plan links to describe the code
  on that commit, not the plan.
- The commit is tagged (`milestone-2`, and the release `v0.3.0` for
  Milestone 2).

## 4. Pre-release checklist

Run on a **clean clone**, not a working copy, so a file that exists only on
one machine can't hide a broken setup. Follow the README; each step below is
a README section, and if a step fails, the README or the code is wrong.

1. `git clone` the repository into a new folder and check out the commit
   being released.
2. **Getting started:** prerequisites, `docker compose up -d`,
   `cp server/.env.example server/.env`, `npm install` in both workspaces,
   `npx prisma generate`, and the migrations, exactly as written.
3. **Seed data:** `npm run db:seed`, then run it again to confirm it stops
   rather than duplicating.
4. **Running:** start the server and the client.
5. **Verifying:** the health check, then every numbered step of the
   walkthrough, comparing each balance and chore the README names.
6. **The rate limit:** the README's burst of wrong passwords shows `429`
   once the limit is reached.
7. **Authorization:** the README's `curl` for another household's members
   answers `404 HOUSEHOLD_NOT_FOUND` with a session.
8. **Tests:** `npm test`, `npm run test:coverage` and
   `npm run test:integration` in `server/`, and `npm test` and
   `npm run test:coverage` in `client/`, all from the clean clone.
9. At 375px in a browser's device toolbar, open the dashboard, History and
   one expense: nothing scrolls sideways.

Record the result in the release's notes: the commit, the date, who ran it,
and anything that failed and how it was fixed.

## 5. Defect handling

A **defect** is behaviour that contradicts an acceptance criterion, the API
contract, a requirement, or the README.

- **Found while reviewing an open PR,** in the code that PR changes: say so in
  the review. It is fixed in that PR, and no issue is needed.
- **Found anywhere else** (in testing, in the walkthrough, on `main`, or in an
  older feature): open an issue labelled **`bug`**, with what was expected,
  what happened instead, and the steps to reproduce it. Give it a priority and
  the current sprint.
  - **`P0`** if it breaks a P0 story, gives a wrong amount of money, or is a
    security flaw. An open `bug` + `P0` blocks the milestone (§3).
  - **`P1`** otherwise.
- **The fix** is a `fix:` PR whose body says `Closes #N` for that issue, so
  the issue links to the change that fixed it. The PR adds a test that fails
  without the fix, so the defect can't quietly come back.
- **A defect accepted rather than fixed** for now is recorded where it
  belongs, with the reason: a known gap in `docs/product-brief.md` §5, or an
  accepted risk in the threat model. The issue stays open with a note.

For example, #73 is a `bug`: the one-household-per-user check isn't atomic.
It was found in review of #39, accepted for Milestone 1 and recorded in the
product brief, and its fix comes with a concurrent test against the
integration database.

## 6. Related evidence

| What | Where |
|---|---|
| Coverage baseline, targets and their reasons | [`docs/testing/coverage.md`](./coverage.md) (#62) |
| Threat model | [`docs/security/threat-model.md`](../security/threat-model.md) (#70) |
| Cross-viewport evidence | [`docs/design/responsive-design.md`](../design/responsive-design.md) §5, with screenshots; real-device testing follows in #66 |
| The implemented security control, with before-and-after evidence | [`docs/security/rate-limiting.md`](../security/rate-limiting.md) (#71) |
| Dependency audit | [`docs/security/dependency-audit.md`](../security/dependency-audit.md) |
| The OWASP Top 10 review | #65, Sprint 4 |
| CI and the required checks | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`docs/process/branch-protection.md`](../process/branch-protection.md) |
