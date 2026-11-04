# Changelog

All notable changes to RoomSync are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and entries are
built from the Conventional Commit history on `main`, one squashed pull
request per commit.

## Versioning

RoomSync uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html),
staying at `0.x` until `v1.0.0` at Milestone 3. Under `0.x`, the minor version
goes up with each release, and the API may still change between releases.

| Version | Marks | Commit |
|---|---|---|
| `v0.1.0` | Milestone 1: the MVP | `1eca04e`, tagged `milestone-1` |
| `v0.2.0` | The end of Sprint 3 (October 14, 2026) | `d1aff59` |
| `v0.3.0` | Milestone 2 | The commit tagged `milestone-2` |

Every version is a GitHub release whose notes match its section below.

## [Unreleased]

### Added

- Docker images for the server and the client, and Docker Compose running
  them with PostgreSQL: `docker compose up --build` serves the whole app at
  http://localhost:8080 with nothing else installed. The server applies
  pending migrations on start; the client's nginx proxies `/api` to it (#116).

### Changed

- `prisma` (the CLI) is now a production dependency of the server, because
  the container runs `prisma migrate deploy` when it starts (#116).

## [0.3.0] - 2026-11-02

Milestone 2: History and the expense detail, editing and deleting an
expense, and revoking an invitation (US-11, US-12, US-14); integration tests
for every main flow; component tests; cross-browser and real-iPhone testing;
an OWASP Top 10 review with security headers; and one household per user
under concurrent requests.

### Added

- **Revoke an invitation** (US-14): the owner sees the household's invitation
  links that can still be used, with when each was created and expires, and
  can revoke one after confirming. A revoked link answers like one that never
  existed. Only the owner can list or revoke; a link already used or expired
  is refused with `409 INVITATION_NOT_PENDING`. No migration (#105).
- **History** (US-11): the household's expenses, payments and completed chores,
  each newest first with its own empty state, one tap from the dashboard. Each
  expense opens a new **expense detail** screen with the payer, the split
  method and every member's share. The dashboard's expenses panel now shows
  the five newest. A test with 500 expenses and five members shows every list
  answering in under 80 ms, inside NFR-02's two seconds (#96).
- **Edit and delete an expense** (US-12): the member who paid, or the household
  owner, can correct an expense on the same form it was recorded with, filled
  in with what was saved, or delete it after a confirmation. Edits re-run every
  check that recording runs. A delete is a soft delete: the expense stops
  counting toward balances, History still lists it struck through with who
  deleted it, and payments already recorded are kept. New `PATCH` and `DELETE`
  endpoints, error codes `NOT_EXPENSE_EDITOR` and `EXPENSE_DELETED`, and a
  migration adding `updated_at`, `deleted_at` and `deleted_by_user_id` to
  `expenses` (#98).
- Integration tests for the money and chore flows: expenses with each split
  method and the balances they produce, checked against amounts worked out by
  hand; settlements, including refusing more than is owed; chores only their
  assignee can complete; the dashboard reflecting all of it; and 404 from
  every household endpoint for a user from another household (#95).
- Component tests for the client with React Testing Library, user-event and
  jsdom, with `lib/api.ts` mocked: login and the auth guard's return path, Add
  expense (preview, a split that doesn't add up, saving), recording a payment
  and an overpayment refused, completing your own chore but not someone
  else's, and the dashboard full, empty and failing to load. Client coverage
  rises from 7% to 57% of statements, and its floor with it (#112).
- A quality-assurance plan (`docs/testing/qa-plan.md`): what each level of
  testing checks, who runs it and when, entry and exit criteria for a
  milestone, a pre-release checklist on a clean clone, and how a defect is
  handled. A pull request template carries its per-PR checklist (#97).
- Cross-viewport testing evidence: all eighteen screens in Chrome, Edge and
  Firefox, in phone landscape and at 200% zoom, and on an iPhone 15 Pro in
  Safari, with screenshots, in `docs/design/responsive-design.md` §5.1. The
  iPhone found the date-field bug fixed in #107 and filed #109 (#113).

### Changed

- The README is the Milestone 2 verification guide: the Status section names
  the submitted version, the tech stack separates what is in place from what
  is planned, the walkthrough adds steps for History, editing and deleting
  an expense, and revoking an invitation, and every test suite has its
  command and expected result (#104).

### Fixed

- On iPhone Safari, the date fields on Add expense, Edit expense and Chores ran
  past their column, because iOS gives a native date input its own minimum
  width. They now line up with the other fields, with the date on the left.
  Found on a real iPhone during the cross-viewport check for #66 (#107).

### Security

- An OWASP Top 10:2025 review (`docs/security/owasp-review.md`). From it:
  security headers on every API response and no `X-Powered-By`; a request
  body over the limit, or in an encoding the server can't read, is now
  `413 PAYLOAD_TOO_LARGE` or `415 UNSUPPORTED_MEDIA_TYPE` rather than a
  logged `500`; and the dependency audit re-run, which raised Express to
  4.22.3 and Prisma to 7.10.1 and cleared every production advisory,
  including the critical `proxy-addr` one. Express 5 was tried and put off to
  Milestone 3. Four gaps were filed: #99, #100, #101, #102 (#103).
- One household per user now holds under concurrent requests. Two creations,
  two invitations accepted together, or a creation racing an acceptance could
  each leave a user in two households. Every write that adds a membership now
  takes a per-user advisory lock and re-checks inside it, so exactly one
  request wins and the other gets `409 ALREADY_IN_HOUSEHOLD`. A concurrent
  integration test fails without the fix and passes with it (#111).

## [0.2.0] - 2026-10-14

The end of Sprint 3: continuous integration with required checks, integration
tests against PostgreSQL, coverage targets, server linting, a threat model,
contribution conventions, and rate limiting on login and registration.

### Added

- Continuous integration with GitHub Actions on every pull request and every
  push to `main`: a `server` job (Prisma client generation, typecheck, unit
  tests), a `client` job (lint, build, tests) and an `integration` job (#81,
  #83).
- Integration tests that run the real app against PostgreSQL with no mocks,
  starting with the account flow: register, log in, `GET /auth/me`, log out,
  with the session stored in the database (#83). The household flow follows:
  create a household, invite, accept, and list the members, with single-use
  and expired links, owner-only invites, one household per user, and 404 for
  outsiders (#87). They use a separate database whose name must end in
  `_test`, emptied before every test, and run with `npm run test:integration`.
- Server linting with ESLint and typescript-eslint (`npm run lint`), run by the
  `server` CI job. It enforces the ADR-001 layering: only repositories may
  import the Prisma client, services may not import Express, and routes and
  middleware may not import repositories (#84).
- A threat model: a data-flow diagram with its trust boundaries, and STRIDE
  applied to accounts and sessions, household membership, invitation links,
  money writes and the session store, with a decision for each threat (#91).
- `CONTRIBUTING.md`: branch names, Conventional Commits, pull request and
  review rules, labels and milestones, and the Definition of Done, with issue
  templates for a user story, a technical task and a docs task (#92).
- Coverage reports for the server and client unit tests
  (`npm run test:coverage`), with a target per area: highest for the server's
  services and the client's money and balance logic. Falling below a target
  fails CI, and CI uploads each report as an artifact. The baseline and the
  reasoning are in `docs/testing/coverage.md` (#94).

### Changed

- `main` is protected by a repository ruleset. A change needs a pull request
  with one approval from the other member, approvals are dismissed by new
  commits, pull requests are squash-merged, and the rules apply to the
  repository admin too (#80). The `server`, `client` and `integration` CI jobs
  are required status checks (#82, #86).
- The backlog and process model plan Milestone 2 (#79).

### Security

- Login is rate-limited per account email and per IP, counting only wrong
  passwords, and registration per IP. Over a limit the API answers
  `429 RATE_LIMITED` with `Retry-After`, and the login screen says how long
  to wait. The limits are set by environment variables (#88).

## [0.1.0] - 2026-09-30

The Milestone 1 MVP: user stories US-01 to US-10, working end to end from
React through Express and Prisma to PostgreSQL.

### Added

- **Accounts:** registration, and login and logout with a server-side session
  stored in PostgreSQL (US-01, US-02; #34, #37, #38).
- **Households:** create a household, see its members, and invite roommates
  with a link that is valid for seven days and joins the household when
  accepted. A user belongs to one household (US-03, US-04; #39, #40, #43,
  #51).
- **Expenses:** record a shared expense split equally, by custom amounts or by
  percentage, with a preview of each member's share before saving. Money is
  stored as integer cents and percentages as basis points, and every split
  sums exactly to the total (US-05, US-06; #47, #50, #52).
- **Balances and settlements:** what each member owes and is owed, derived
  from expenses and payments rather than stored, and recording a payment
  between members. A payment larger than the debt is refused (US-07, US-08;
  #54).
- **Chores:** create, assign, edit and complete chores. Only the assignee can
  complete an assigned chore (US-09; #53).
- **Dashboard:** one screen with the household's balances, chores and recent
  activity (US-10; #58).
- Seed data for a demo household, and PostgreSQL 16 through Docker Compose
  (#29, #31, #52, #58).
- Unit tests for the server's routes and services, and for the client's money
  and wording logic.
- Design documentation: API contract, ADR-001, process model, use cases,
  product brief, wireframes, design classes, module structure, analysis model,
  component designs, design patterns and responsive design (#32, #33, #35,
  #36, #41, #46, #55, #56, #59).

### Fixed

- Creating a household when the user already has one now shows the existing
  household instead of a form that can never succeed, and an expired session
  on the dashboard sends the user to log in instead of reporting that the
  server is down (#48).

### Security

- Passwords are hashed with bcrypt, and a login with an unknown email does the
  same bcrypt work as a wrong password, so response time doesn't reveal which
  emails are registered (#34, #37).
- The session cookie is `httpOnly` and `SameSite=Lax`, and `Secure` in
  production. The server refuses to start without `SESSION_SECRET`, and in
  production refuses the example value (#37).
- A household the user doesn't belong to answers `404`, exactly like one that
  doesn't exist, so the API can't be used to discover other households (#40).
- Invitation tokens are 32 random bytes (#51).

[Unreleased]: https://github.com/orvaldez/RoomSync/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/orvaldez/RoomSync/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/orvaldez/RoomSync/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/orvaldez/RoomSync/releases/tag/v0.1.0
