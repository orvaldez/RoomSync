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
| `v0.2.0` | The end of Sprint 3 (October 14, 2026) | |
| `v0.3.0` | Milestone 2 | The commit tagged `milestone-2` |

Every version is a GitHub release whose notes match its section below.

## [Unreleased]

### Added

- Continuous integration with GitHub Actions on every pull request and every
  push to `main`: a `server` job (Prisma client generation, typecheck, unit
  tests), a `client` job (lint, build, tests) and an `integration` job (#81,
  #83).
- Integration tests that run the real app against PostgreSQL with no mocks,
  starting with the account flow: register, log in, `GET /auth/me`, log out,
  with the session stored in the database. They use a separate database whose
  name must end in `_test`, emptied before every test, and run with
  `npm run test:integration` (#83).
- Server linting with ESLint and typescript-eslint (`npm run lint`), run by the
  `server` CI job. It enforces the ADR-001 layering: only repositories may
  import the Prisma client, services may not import Express, and routes and
  middleware may not import repositories (#84).

### Changed

- `main` is protected by a repository ruleset. A change needs a pull request
  with one approval from the other member, approvals are dismissed by new
  commits, pull requests are squash-merged, and the rules apply to the
  repository admin too (#80). The `server`, `client` and `integration` CI jobs
  are required status checks (#82, #86).
- The backlog and process model plan Milestone 2 (#79).

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

[Unreleased]: https://github.com/orvaldez/RoomSync/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/orvaldez/RoomSync/releases/tag/v0.1.0
