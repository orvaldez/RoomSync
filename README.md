# RoomSync

[![CI](https://github.com/orvaldez/RoomSync/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/orvaldez/RoomSync/actions/workflows/ci.yml)

RoomSync is a web-based household management application that helps roommates
coordinate shared expenses, chores, and household membership in one place.
Unlike trip-based expense splitters, RoomSync is built around a **standing
household**: balances persist and carry forward across the length of a lease
instead of resetting, and expenses and chores are managed in the same shared
space.

This repository contains the source code, documentation, and project
artifacts for RoomSync, developed as part of a Software Design and
Development course project.

## Status

Milestone 1 (Build) is complete: every P0 user story, US-01 through US-10, is
built and merged, with its design documentation. The submitted version is the
commit tagged `milestone-1`.

Milestone 2 (Test) is complete, submitted November 2, 2026. The submitted
version is the commit tagged `milestone-2`, released as `v0.3.0`
([CHANGELOG.md](./CHANGELOG.md)). It adds:

- **New features:** the History screen and expense detail (US-11), editing
  and deleting an expense (US-12), and revoking an invitation link (US-14).
- **Testing:** integration tests for every main flow against PostgreSQL, a
  coverage report with a target per area, and a QA plan.
- **Security:** a threat model, an OWASP Top 10 review, and rate limiting on
  login and registration as the implemented control, with security headers on
  every API response.
- **Process:** CI on every pull request, branch protection on `main` with
  required review and checks, and documented contribution conventions.

Removing a member or leaving a household (US-13) was planned for Milestone 2
but not finished; it moves to Milestone 3, with the other open items in
[BACKLOG.md](./BACKLOG.md#sprint-3-and-sprint-4-plan-milestone-2).

| Milestone | Goal | Status |
|---|---|---|
| Milestone 0 | Propose | Complete |
| Milestone 1 | Build the MVP | Complete (`milestone-1`, `v0.1.0`) |
| Milestone 2 | Test, improve, and secure | Complete (`milestone-2`, `v0.3.0`) |
| Milestone 3 | Deploy | In progress, due November 30, 2026 ([plan](./BACKLOG.md#sprint-5-and-sprint-6-plan-milestone-3)) |

## Team

| Name | Email | Role |
|---|---|---|
| Orlando Rodriguez Valdez | orodriguezval@crimson.ua.edu | Accounts, auth/session, balances, settlements |
| Agustin Lemuz-Juarez | alemuzjuarez@crimson.ua.edu | Households, invitations, expense entry/split logic |

## Tech stack

| Layer | Technology | Status |
|---|---|---|
| Frontend | React 19 + TypeScript, built with Vite 6 | In place |
| Backend | Node.js 20 + Express 4 + TypeScript | In place |
| Database | PostgreSQL 16 | In place |
| ORM | Prisma 7 | In place |
| Auth | Session-based auth stored in PostgreSQL, bcrypt password hashing, rate-limited login | In place |
| Containerization | Docker: images for the server and the client (nginx), and Docker Compose running them with PostgreSQL | In place (#116) |
| CI | GitHub Actions: lint, typecheck, build, unit tests with coverage, integration tests | In place; required to merge |
| Testing | Vitest 2 + Supertest; `@vitest/coverage-v8`; integration tests against PostgreSQL | In place |
| Component tests | React Testing Library, in jsdom | In place (#76) |
| Deployment | Render | Planned for Milestone 3 |

Version pins worth knowing: Vite 6 rather than 8, and Vitest 2 rather than 4,
because the newer majors depend on Rolldown, whose native binding is blocked
by Windows Application Control on a team member's machine. See
[docs/security/dependency-audit.md](./docs/security/dependency-audit.md).


See the [project proposal](./docs/proposal.pdf) for full justification of
these choices.

## Repository structure

```
roomsync/
├── client/ # React frontend
│ ├── Dockerfile # Build, then nginx serving it and proxying /api
│ ├── nginx/ # nginx's site config template
│ └── src/
├── server/ # Node/Express API
│   ├── Dockerfile # Build, then a non-root runtime that migrates and starts
│   ├── .env.example
│   ├── .env
│ ├── prisma/ # Database schema and migrations
│ └── src/
│ ├── routes/ # HTTP boundary, no business logic
│ ├── services/ # Business rules
│ ├── repositories/# The only modules that touch Prisma
│ ├── middleware/
│ └── integration/ # Integration tests against PostgreSQL
├── docs/ # Proposal, diagrams, design artifacts
└── docker-compose.yml
```

Layering is defined in ADR-001: routes call services, services call
repositories, repositories call Prisma. A layer may not skip a layer or call
a higher one. See `server/src/repositories/README.md`.

## Getting started

There are two ways to run RoomSync locally. **Docker only** runs the whole app
in containers with nothing else installed, and is the quickest way to try it.
**Development** runs the server and client on your machine with live reload,
which is how we work on it. Both use the same PostgreSQL container.

### Quick start: Docker only

Needs only Docker Desktop, running. No Node.js, no `.env` file.

```bash
git clone https://github.com/orvaldez/RoomSync.git
cd RoomSync
docker compose up --build -d                     # builds and starts db, server and client
docker compose exec server node dist/seed.js     # loads the demo household (below)
```

Then open **http://localhost:8080** and sign in as any account in
[Seed data](#seed-data), password `roomsync123`.

- **The first build takes a few minutes;** later starts take seconds.
- **The services:**
  - `db` is PostgreSQL 16.
  - `server` is the API. It applies any pending migrations with
    `prisma migrate deploy` every time it starts, before it listens.
  - `client` is nginx. It serves the built client and passes `/api` to the
    server, so the browser sees one address, as it does in development.

  Compose starts each service only once the one before it is healthy.
- **Check it's up:** `docker compose ps` shows all three as running, with `db`
  and `server` healthy. `docker compose logs server` shows the migrations and
  `RoomSync API listening on port 4000`.
- **Start over with an empty database:** `docker compose down -v`, then both
  commands above again.
- **Ports:** only 8080 (the app) and 5432 (PostgreSQL) are published, and
  5432 only on this machine (`127.0.0.1`), not to the local network. The API
  is reached through the app's `/api`, so port 4000 stays free for
  development. If 8080 is taken, set `ROOMSYNC_PORT` (for example
  `ROOMSYNC_PORT=8081 docker compose up --build -d` in Git Bash, or
  `$env:ROOMSYNC_PORT=8081` first in PowerShell), then use that port instead.
- **Here the server runs in development mode.** The images themselves default
  to production, which is how the deployment runs them (#117). Over plain
  HTTP on localhost, production's HTTPS-only session cookie would never be
  sent back, so `docker-compose.yml` sets `NODE_ENV: development` and a
  local-only `SESSION_SECRET`.

### Development setup

Needs Node.js 20 or newer, and Docker Desktop running. Docker here runs only
the database; the server and client run on your machine. The sections below,
from Environment variables to Tests, all describe this setup.

```bash
git clone https://github.com/orvaldez/RoomSync.git
cd RoomSync
cp server/.env.example server/.env

docker compose up -d db       # starts only PostgreSQL, on port 5432
docker compose ps             # confirm the db container is up (healthy)

cd server && npm install
cd ../client && npm install
```

### Environment variables

The server reads `server/.env`, which `cp server/.env.example server/.env`
creates above. The example values work as-is with the Docker Compose database;
the client needs no environment variables.

| Variable | Example value | What it is for |
|---|---|---|
| `DATABASE_URL` | `postgresql://roomsync:roomsync@localhost:5432/roomsync?schema=public` | PostgreSQL connection string, used by Prisma and by the session store. The user, password and database name match `docker-compose.yml` |
| `PORT` | `4000` | Port the API listens on (default 4000). The Vite dev server proxies `/api` to 4000 (`client/vite.config.ts`), so change both together |
| `SESSION_SECRET` | `change-me-in-your-local-env` | Signs the session cookie. Required: the server refuses to start without it, and in production refuses the example value |
| `NODE_ENV` | unset | Leave unset in development. `production` turns on the secure cookie and trusted proxy and makes the seed refuse to run; `test` is set by the test runner and uses an in-memory session store; `integration` is set by the integration test runner and keeps the PostgreSQL store |
| `RATE_LIMIT_WINDOW_MINUTES` | unset (15) | Optional. The window the three limits below count over |
| `LOGIN_MAX_FAILURES_PER_EMAIL` | unset (5) | Optional. Wrong passwords allowed per account email per window, then `429 RATE_LIMITED` |
| `LOGIN_MAX_FAILURES_PER_IP` | unset (20) | Optional. Wrong passwords allowed per IP address per window, across all accounts |
| `REGISTER_MAX_PER_IP` | unset (10) | Optional. Registration attempts allowed per IP address per window |
| `SECURITY_LOG` | unset | Optional. Security events (failed logins, rate limits, 403s, household 404s) are written to stdout as JSON lines, on by default and off under the test runners. `on` or `off` overrides that (`server/src/middleware/security-log.ts`, #99) |
| `TEST_DATABASE_URL` | `postgresql://roomsync:roomsync@localhost:5432/roomsync_test?schema=public` | Optional. The database `npm run test:integration` uses; the example value is also the default. Its name must end in `_test`, because every integration test empties it |

`server/.env` is ignored by Git. Never commit a real secret.

### Database

The schema lives in `server/prisma/schema.prisma`. Prisma CLI configuration —
schema path, migration path, and the connection string — lives in
`server/prisma.config.ts`, which loads `server/.env` explicitly, since Prisma 7
no longer reads `.env` on its own.

```bash
cd server
npx prisma migrate dev     # apply migrations, creating the database if needed
npx prisma generate        # regenerate the client after any schema change
```

`migrate dev` no longer runs `generate` automatically in Prisma 7, so run both
after pulling a schema change.

To inspect the data:

```bash
npx prisma studio
docker compose exec db psql -U roomsync -d roomsync -c "\dt"
```

To start over from an empty database:

```bash
npx prisma migrate reset
```

### Seed data

```bash
cd server && npm run db:seed
```

Creates the household **Apartment 41**, so every screen has something on it
before you record anything yourself:

- **Four members** (below).
- **Five expenses** in all three split methods: equal (including one with an
  odd cent, and one Priya is not part of), custom amounts, and percentages.
- **Two settlements**: Marcus pays Orlando off exactly, so that pair reads
  "settled up", and Agustin pays Priya part of what he owes.
- **Seven chores**: outstanding ones for every member, one overdue, one
  unassigned, and two completed.

Dates are relative to the day you run it, so the chores read "due tomorrow" and
"overdue" rather than drifting into the past. What it creates is in
`server/src/seed-data.ts`, and `seed-data.test.ts` checks it: every expense
splits, and no settlement is more than was owed at the time.

Sign in as any member with the password `roomsync123`:

| Email | Name | Role |
|---|---|---|
| `orlando@roomsync.test` | Orlando Rodriguez Valdez | Owner |
| `agustin@roomsync.test` | Agustin Lemuz-Juarez | Member |
| `marcus@roomsync.test` | Marcus Lee | Member |
| `priya@roomsync.test` | Priya Shah | Member |

Running it twice is safe: it stops if the seed household is already there
rather than duplicating anything. It writes everything in one transaction, so
a failure leaves nothing half-created, and it refuses to run when `NODE_ENV` is
`production`. After `npx prisma migrate reset`, run the
seed again — either `npm run db:seed` or `npx prisma db seed`, which uses the
same command from `prisma.config.ts`.

These accounts exist only in local development. The password is deliberately
committed here because the data is fictional and the database is a throwaway
container.

### Running

Two terminals, both from the repo root.

```bash
cd server && npm run dev      # http://localhost:4000
```

```bash
cd client && npm run dev      # http://localhost:5173
```

The Vite dev server proxies `/api` to the Express server, so no CORS
configuration is needed in development.

### Verifying

First, that the API is up:

```bash
curl http://localhost:4000/api/health
# -> {"status":"ok","service":"roomsync-api"}
```

With the Docker-only quick start, the same check goes through the client's
proxy instead: `curl http://localhost:8080/api/health`. Then use
http://localhost:8080 wherever this guide says http://localhost:5173.

Then open http://localhost:5173. With the seed data loaded, this walkthrough
exercises every layer — React, Express, service, repository, PostgreSQL:

1. **Sign in** as `agustin@roomsync.test` / `roomsync123`. You land on the
   dashboard for Apartment 41.
2. **Read the dashboard.** Members lists all four, with the owner marked. Your
   balance says you owe $10.88 and are owed $2.00: $4.88 to Orlando and $6.00
   to Priya, with Marcus owing you $2.00. Your chores shows "Take out the
   trash", due tomorrow. Recent activity lists the payments, completed chores
   and expenses, newest first. All of it is one request to the server.
3. **Refresh the page.** You stay signed in — the session lives in PostgreSQL,
   so it survives a page reload and a server restart.
4. **Add an expense.** Use *Add expense*, type a description and an amount, and
   look at the preview: every member is included and split equally by default.
   Try *By amount* with amounts that do not add up to the total; it is
   rejected rather than silently adjusted. Set *Paid by* to Priya Shah, save
   an equal split, and the dashboard confirms it, with your balance updated.
   (An expense Priya paid only changes what each person owes her, so the
   $4.88 between you and Orlando stays as it is for step 5.)
5. **Record a payment.** Open *Balances*, choose *Record payment* next to
   Orlando, and save the suggested $4.88. That pair now reads "settled up".
   Try paying more than you owe and it is refused.
6. **Complete a chore.** Open *Chores* and mark "Take out the trash" complete.
   Sign in as `marcus@roomsync.test` and his "Clean the bathroom" shows as
   overdue; he cannot complete a chore assigned to someone else.
7. **Invite a roommate.** Sign in as `orlando@roomsync.test`, the owner, and
   choose *Invite a roommate*. Opening the link in a private window asks you to
   sign in or create an account first, then offers to join. Members do not see
   the invite button, and the server refuses them anyway.

**The Milestone 2 features.** Carry on from step 7, signed in as Orlando:

8. **History** (US-11). On the dashboard choose *History*. Three lists, newest
   first: every expense, including the one you added in step 4; every payment,
   including Agustin's $4.88 from step 5, which stays listed even though that
   pair is now settled up; and the completed chores, each saying who it was
   assigned to and when it was done, including "Take out the trash" from
   step 6. The links at the top jump to each list.
9. **Expense detail** (US-11). Open *Internet*. It says it was paid by Agustin,
   split by percentage between 4 people, with each share: you and Agustin 30%,
   $21.00 each; Marcus and Priya 20%, $14.00 each. Orlando owns the household,
   so *Edit* and *Delete* are offered. Sign in as `marcus@roomsync.test` and
   open the same expense: he neither paid it nor owns the household, so
   neither button appears, and the API refuses him with
   `403 NOT_EXPENSE_EDITOR` if he tries anyway.
10. **Edit an expense** (US-12). Sign in as `agustin@roomsync.test`, who paid
    it, open *Internet* and choose *Edit*. The form opens filled in with what
    was saved: $70.00 and 30 / 30 / 20 / 20. Change the amount to 80.00 and
    choose *Save changes*. The shares become $24.00, $24.00, $16.00 and
    $16.00, and on *Balances* what Marcus owes you rises by exactly $2.00.
11. **Delete an expense** (US-12). On *Internet* choose *Delete*. It explains
    what deleting does and asks first; *Keep it* changes nothing. Choose
    *Delete expense*: the page now says "Deleted by you", with no buttons, and
    everyone's balances drop the expense. The dashboard's *Recent expenses* no
    longer shows it, while *History* still lists it, struck through, saying who
    deleted it. Payments already recorded are never changed.
12. **Revoke an invitation** (US-14). Sign in as `orlando@roomsync.test`
    again. The dashboard's Members panel lists the *Invitation links* still in
    use, each with when it was created and when it expires, including the one
    you made in step 7. Choose *Revoke* on it: it asks first, and *Keep it*
    changes nothing. Choose *Revoke link*: the link leaves the list, and
    opening it in a private window, after signing in there as in step 7, now
    says "This invitation is not valid", the same as a link that was already
    used. Members see no invitation
    links, and the API refuses them with `403 NOT_HOUSEHOLD_OWNER`.

To start the walkthrough over, reset and seed again:

```bash
cd server && npx prisma migrate reset && npm run db:seed
```

With the Docker-only quick start, start over with an empty database instead:

```bash
docker compose down -v && docker compose up --build -d && docker compose exec server node dist/seed.js
```

To confirm authorization is enforced server-side rather than only in the
interface, ask for a household you do not belong to:

```bash
curl -i http://localhost:4000/api/households/some-other-id/members
# -> 401 UNAUTHENTICATED without a session; 404 HOUSEHOLD_NOT_FOUND with one
```

The 404 is deliberate: a household you are not a member of answers exactly
like one that does not exist, so the API cannot be used to discover other
households.

Every API response also carries security headers, and none says which
framework serves it ([OWASP review](./docs/security/owasp-review.md), A02):

```bash
curl -sI http://localhost:4000/api/health
# -> Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
#    X-Content-Type-Options: nosniff, X-Frame-Options: DENY,
#    Referrer-Policy: no-referrer, Cache-Control: no-store, and no X-Powered-By
```

#### The rate limit on login

Login and registration are rate-limited, so passwords can't be guessed at
speed. With the API running, send 20 wrong passwords for one account:

```bash
cd server && node scripts/login-burst.mjs 20
```

Attempts 1 to 5 answer `401 INVALID_CREDENTIALS`, and the rest
`429 RATE_LIMITED` with a `Retry-After` header. In the browser,
`agustin@roomsync.test` now shows "Too many failed login attempts. Try again
in …" with the time left, up to 15 minutes, even with the right password, while `marcus@roomsync.test`
still signs in. Restarting the server resets the counters. The limits, the
before-and-after evidence and the trade-offs are in
[`docs/security/rate-limiting.md`](./docs/security/rate-limiting.md).

### Tests

Every suite, and what a passing run looks like at the `milestone-2` commit.
All of them also run in CI on every pull request
([Continuous integration](#continuous-integration)).

| Suite | Command | Needs | Expected |
|---|---|---|---|
| Server unit | `cd server && npx prisma generate && npm test` | Nothing running | `Tests 483 passed`, 0 failed |
| Server coverage | `cd server && npm run test:coverage` | Nothing running | The same 483 pass, a coverage table prints, and every target in `vitest.config.ts` is met (the run fails if not) |
| Server integration | `cd server && npm run test:integration` | `docker compose up -d db` | `Tests 33 passed` across 9 files, including the 500-expense timing check and the concurrent one-household-per-user check |
| Client unit | `cd client && npm test` | Nothing running | `Tests 157 passed`, 0 failed, 12 files: the `lib` tests and the component tests |
| Client coverage | `cd client && npm run test:coverage` | Nothing running | The same 157 pass and every target in `vitest.config.ts` is met |
| Lint, types, build | `cd server && npm run lint && npm run typecheck`, `cd client && npm run lint && npm run build` | Nothing running | No errors |

The sections below explain each suite.

```bash
cd server && npm test
```

The test suite imports the Express app, which reaches `@prisma/client`, so the
Prisma client must be generated first:

```bash
cd server && npx prisma generate && npm test
```

`npm install` does not generate it, and Prisma 7 no longer generates it as part
of `migrate dev`. On a fresh clone, run `npx prisma generate` once.

The client has its own suite, which needs no database or server:

```bash
cd client && npm test
```

It covers the pure logic in `client/src/lib/`: `money.ts`, which turns what a
user types into the integer cents the server stores, and the wording of
balances, chore due dates and dashboard activity, where the direction of a
sentence ("you owe" or "owes you") is the easiest thing to get backwards. It also
covers the History and expense-editing wording, and turning a saved expense
back into the edit form. The component tests in `client/src/pages/*.test.tsx`
render screens with React Testing Library and click through them, with
`lib/api.ts` mocked: login and the return path after it, Add expense,
recording a payment, completing a chore, and the dashboard. The screens are
also checked by hand at 375px and 1280px
([responsive-design.md](./docs/design/responsive-design.md)).

#### Coverage

```bash
cd server && npx prisma generate && npm run test:coverage
cd client && npm run test:coverage
```

Runs the unit tests and prints a coverage table, with an HTML report at
`coverage/index.html` in that workspace (git-ignored). Each workspace's
`vitest.config.ts` sets a coverage target per area, and falling below one
fails the run, and CI. The baseline, the targets and why each is set where it
is are in [docs/testing/coverage.md](./docs/testing/coverage.md).

#### Integration tests

The unit tests above mock the repositories, so none of them run real SQL. The
integration tests run the real app, with nothing mocked, against PostgreSQL and
its session store, through Supertest with a real session cookie. With the
Compose database running (`docker compose up -d db`):

```bash
cd server && npx prisma generate && npm run test:integration
```

They use a separate database, `roomsync_test`, on the same Compose service, and
never touch the dev database. The first run creates it; every run applies the
migrations with `prisma migrate deploy`, and each test starts by emptying every
table. To use a different database, set `TEST_DATABASE_URL`: the suite refuses
any database whose name doesn't end in `_test`. The tests live in
`server/src/integration/`, and `npm test` doesn't run them.

They cover the main flows, one file each: the account (`auth`), households and
invitations (`household`), expenses, balances and settlements (`money`), chores
(`chore`), the dashboard (`dashboard`), and 404 for anyone outside a household
(`isolation`). The expected balances in `money.integration.test.ts` are worked
out by hand in its comments.

### Continuous integration

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on every pull
request and every push to `main`, on Node 20, as three jobs:

| Job | Steps |
|---|---|
| `server` | `npm ci`, `npx prisma generate`, `npm run typecheck`, `npm run lint`, `npm run test:coverage`, then uploads the coverage report as the `coverage-server` artifact |
| `client` | `npm ci`, `npm run lint`, `npm run build` (which runs `tsc -b`), `npm run test:coverage`, then uploads the `coverage-client` artifact |
| `integration` | A `postgres:16` service container, then `npm ci`, `npx prisma generate`, `npm run test:integration` |

To reproduce a failing job locally, run the same steps in that directory. The
server job sets a placeholder `DATABASE_URL`, because `prisma.config.ts` needs
one for `prisma generate` even though the unit tests use no database. The
server lint includes the layering rules from ADR-001: outside
`server/src/repositories/`, importing Prisma fails the build
([how it works](./docs/architecture/layering-lint.md)). The job
names are the status checks the branch protection ruleset requires, so a job
is renamed only together with the ruleset.

### Stopping

```bash
docker compose down           # stops every container; data persists in a named volume
docker compose down -v        # also deletes the database volume, for a clean start
```

## Documentation

- [Project proposal](./docs/proposal.pdf)
- [Prioritized backlog](./BACKLOG.md)
- [Quality-assurance plan](./docs/testing/qa-plan.md): test levels, who runs what and when, milestone entry and exit criteria, the pre-release checklist, and defect handling
- [Metrics report: coverage trend, code quality, how work flowed](./docs/process/metrics.md)
- [Changelog and versioning](./CHANGELOG.md)
- [Threat model](./docs/security/threat-model.md),
  [rate limiting on login and registration](./docs/security/rate-limiting.md), and
  [one household per user under concurrent requests](./docs/security/one-household-race.md)
- [OWASP Top 10 review](./docs/security/owasp-review.md) and the
  [dependency audit](./docs/security/dependency-audit.md)
- [API contract](./docs/design/api-contract.md)
- [Contributing: branches, commits, reviews and issues](./CONTRIBUTING.md)
- [Software process model](./docs/process-model.md), with
  [branch protection on `main`](./docs/process/branch-protection.md)
- [Risk register](./docs/process/risk-register.md) and
  [maintenance and support plan](./docs/process/maintenance-plan.md)
- [ADR-001: Architecture](./docs/architecture/adr-001-modular-monolith.md), with
  [its layering enforced by lint](./docs/architecture/layering-lint.md)
- [Use case specifications](./docs/requirements/use-cases.md)
- [Analysis model](./docs/requirements/analysis-model.md)
- [Design patterns](./docs/design/design-patterns.md)
- [Test coverage: baseline and targets](./docs/testing/coverage.md)
- [AI-assisted workflow: the record for #90](./docs/process/ai-assisted-workflow.md)
- [Responsive design considerations](./docs/design/responsive-design.md), with
  [screenshots of every screen at 375px and 1280px](./docs/design/screenshots/)
- [Product brief and MVP scope](./docs/product-brief.md)
- [UX wireframes](./docs/design/wireframes/README.md)
- [Design classes](./docs/design/design-classes.md)
- [Module structure](./docs/design/module-structure.md)
- [Component designs: Create Expense, Record Settlement](./docs/design/component-designs.md)
- Architecture diagram — see proposal, Figure 2
- Entity relationship diagram — see proposal, Figure 3

## Contributing

All work happens on short-lived branches off `main` and is merged through
pull requests that need CI to pass and an approval from the other team
member. [`CONTRIBUTING.md`](./CONTRIBUTING.md) covers branch names, commit
and pull request conventions, reviewing, issue templates and labels, and the
Definition of Done.

## License

Course project — not currently licensed for outside use.
