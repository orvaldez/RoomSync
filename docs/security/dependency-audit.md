# Dependency audit

Findings from `npm audit --omit=dev` in `server/`, with triage and decisions.
Re-run and update this file at each milestone.

## 2026-10-07 (express-rate-limit, issue #71)

Checked before adding `express-rate-limit` 8.7.0 for the login and
registration rate limits (`rate-limiting.md`).

| | Total | Critical | High | Moderate |
|---|---|---|---|---|
| Before installing | 8 | 1 | 4 | 3 |
| After installing | 8 | 1 | 4 | 3 |

None of the 8 is in its dependency tree (`debug`, `ip-address`). Two are not
in the September table below, and belong to the Milestone 2 review (#65):

- **`proxy-addr` (critical, GHSA-jqcg-44mw-7w3h),** via Express: IP spoofing
  when a trusted proxy is configured as a subnet that an IPv4-mapped IPv6
  address can match. RoomSync trusts proxies by hop count (`trust proxy 1`,
  production only), not by subnet, so it does not appear to apply. It
  matters here because the per-IP limits rely on `req.ip`. Express 4.22.2
  accepts the fixed 2.0.8, so `npm update proxy-addr` should clear it without
  a major upgrade.
- **`fast-uri` (moderate, GHSA-hrr3-gc8f-f4qj),** via `prisma` → `@prisma/dev`
  → `ajv`, the CLI's local development tooling.

## 2026-09-09 (scaffold, issue #24)

Six findings after pinning Prisma to 7.10.0 stable.

| Package | Severity | Reachable in RoomSync? | Decision |
|---|---|---|---|
| qs (via express 4.22.2) | Moderate | Yes, query-string parsing on every request | Accept for now |
| mysql2 (via prisma CLI) | High | No, RoomSync uses PostgreSQL; the MySQL driver is never loaded | Accept |
| deepmerge-ts (via @prisma/config) | High | No, config merging at startup on files we control, not attacker input | Accept |

### Reasoning

`npm audit fix --force` was not run. It would install Express 5 and downgrade
Prisma to 6.19.3, reversing two deliberate decisions:

- Express is pinned to 4.x because 5 changed error handling and typings, and
  most available documentation still assumes 4.
- Prisma 7.10.0 is the current stable line. `npm install prisma` initially
  pulled an 8.0.0 release candidate, which was replaced with the stable
  version before any schema work began.

`qs` is the only finding on a code path RoomSync actually executes. Express
4.22.2 is the latest 4.x, so no patch exists short of the major upgrade. The
risk is accepted for Milestone 1 and revisited during the Milestone 2 OWASP
review, when the Express 5 upgrade can be evaluated against a passing test
suite rather than against no tests at all.

### Environment note

The client pins Vite 6 and the server pins Vitest 2, both because Vite 8 and
Vitest 4 depend on Rolldown, whose native binding is blocked by Windows
Application Control on a team member's machine.
