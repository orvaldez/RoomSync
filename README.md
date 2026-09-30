# RoomSync

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

Milestone 1 (Build) in progress. The client and server workspaces are
running end to end; feature work is underway.

| Milestone | Goal | Status |
|---|---|---|
| Milestone 0 | Propose | Complete |
| Milestone 1 | Build the MVP | In progress |
| Milestone 2 | Test, improve, and secure | Not started |
| Milestone 3 | Deploy | Not started |

## Team

| Name | Email | Role |
|---|---|---|
| Orlando Rodriguez Valdez | orodriguezval@crimson.ua.edu | Accounts, auth/session, balances, settlements |
| Agustin Lemuz-Juarez | alemuzjuarez@crimson.ua.edu | Households, invitations, expense entry/split logic |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript, built with Vite 6 |
| Backend | Node.js + Express 4 + TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma 7 |
| Auth | Session-based auth, bcrypt password hashing |
| Containerization | Docker Compose |
| CI/CD | GitHub Actions |
| Testing | Vitest 2 + Supertest |
| Deployment | Render |

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
│ └── src/
├── server/ # Node/Express API
│   ├── .env.example
│   ├── .env
│ ├── prisma/ # Database schema and migrations
│ └── src/
│ ├── routes/ # HTTP boundary, no business logic
│ ├── services/ # Business rules
│ ├── repositories/# The only modules that touch Prisma
│ └── middleware/
├── docs/ # Proposal, diagrams, design artifacts
└── docker-compose.yml
```

Layering is defined in ADR-001: routes call services, services call
repositories, repositories call Prisma. A layer may not skip a layer or call
a higher one. See `server/src/repositories/README.md`.

## Getting started

### Prerequisites

- Node.js 20 or newer
- Docker Desktop, running

### Setup

```bash
git clone https://github.com/orvaldez/RoomSync.git
cd RoomSync
cp server/.env.example server/.env

docker compose up -d          # starts PostgreSQL on port 5432
docker compose ps             # confirm the db container is up

cd server && npm install
cd ../client && npm install
```

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

Creates the household **Apartment 41** with two members and two expenses — one
split equally with an odd cent, one split 60/40 by percentage — so balances
have something in them before you record anything yourself.

Sign in as either member with the password `roomsync123`:

| Email | Role |
|---|---|
| `orlando@roomsync.test` | Owner |
| `agustin@roomsync.test` | Member |

Running it twice is safe: it stops if the seed household is already there
rather than duplicating anything. After `npx prisma migrate reset`, run the
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

Then open http://localhost:5173. With the seed data loaded, this walkthrough
exercises every layer — React, Express, service, repository, PostgreSQL:

1. **Sign in** as `orlando@roomsync.test` / `roomsync123`. You land on the
   dashboard for Apartment 41.
2. **Check the members panel.** It lists both members with the owner marked.
   This comes from a real query behind a membership guard, not fixture data.
3. **Refresh the page.** You stay signed in — the session lives in PostgreSQL,
   so it survives a page reload and a server restart.
4. **Add an expense.** Use *Add expense*, enter an amount, choose a split, and
   look at the preview before saving. The shares are calculated on the server,
   so what the preview shows is exactly what gets stored.
5. **Try an invalid split.** Give a custom split amounts that do not add up to
   the total. It is rejected rather than silently adjusted.
6. **Invite a roommate.** As the owner, generate an invitation link. Opening it
   in a private window prompts for sign-in first.

To confirm authorization is enforced server-side rather than only in the
interface, ask for a household you do not belong to:

```bash
curl -i http://localhost:4000/api/households/some-other-id/members
# -> 401 UNAUTHENTICATED without a session; 404 HOUSEHOLD_NOT_FOUND with one
```

The 404 is deliberate: a household you are not a member of answers exactly
like one that does not exist, so the API cannot be used to discover other
households.

### Tests

```bash
cd server && npm test
```

The test suite imports the Express app, which reaches `@prisma/client`, so the
Prisma client must be generated first:

```bash
cd server && npx prisma generate && npm test
```

`npm install` does not generate it, and Prisma 7 no longer generates it as part
of `migrate dev`. On a fresh clone, run `npx prisma generate` once. The
continuous integration workflow needs the same step before it runs the tests.

The client has its own suite, which needs no database or server:

```bash
cd client && npm test
```

It covers the pure logic in `client/src/lib/`, starting with `money.ts`, which
turns what a user types into the integer cents the server stores. Component
tests are planned with the Milestone 2 test plan.

### Stopping

```bash
docker compose down           # data persists in a named volume
```

## Documentation

- [Project proposal](./docs/proposal.pdf)
- [Prioritized backlog](./BACKLOG.md)
- [API contract](./docs/design/api-contract.md)
- [Software process model](./docs/process-model.md)
- [ADR-001: Architecture](./docs/architecture/adr-001-modular-monolith.md)
- [Use case specifications](./docs/requirements/use-cases.md)
- [Product brief and MVP scope](./docs/product-brief.md)
- Architecture diagram — see proposal, Figure 2
- Entity relationship diagram — see proposal, Figure 3

## Contributing

All work happens on feature branches off `main` and is merged through
pull requests requiring review from the other team member. See the
proposal's Agile Development Process section for branching conventions,
commit message format, and the Definition of Done.

## License

Course project — not currently licensed for outside use.
