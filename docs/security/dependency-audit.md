# Dependency audit

Findings from `npm audit --omit=dev` in `server/`, with triage and decisions.
Re-run and update this file at each milestone.

## 2026-11-04 (two new production advisories, before the deployment)

Two advisories published since the October 21 review reached the server's
production dependencies, both found while reviewing #131 (containers). Fixed
before #117 deploys anything, by updating only the two packages within the
ranges their parents already accept. No `package.json` change.

| Package | Advisory | Severity | Through | Before | After |
|---|---|---|---|---|---|
| `body-parser` | GHSA-27r3-jxmh-p828: denial of service through trailing bytes after a compressed request body | High | `express` 4.22.3 | 1.20.8 | **1.20.9** |
| `ip-address` | GHSA-rxp7-6hxx-x8q5: a long IPv6 zone identifier takes quadratic time | Moderate | `express-rate-limit` 8.7.0 | 10.7.3 | **10.7.4** |

| Workspace | Scope | Before | After |
|---|---|---|---|
| `server/` | production (`--omit=dev`) | 2 (1 high, 1 moderate) | **0** |
| `server/` | all, dev included | 21 (3 critical, 2 high, 16 moderate) | 19 (3 critical, 1 high, 15 moderate) |
| `client/` | production | 0 | 0 |

**Why these versions.** The project takes the newest version that is at least
two weeks old.
- **`ip-address` 10.7.4** (October 11) is the first release with the fix.
  10.7.5 and 10.7.6 are newer than two weeks.
- **`body-parser` 1.20.9** (October 22) is the only fixed release on the 1.x
  line Express 4 uses. It was 13 days old when #132 merged, the evening of
  November 4: a day early, on purpose, because it fixes a high-severity
  denial of service and the two-week rule guards against brand-new releases,
  which this wasn't.

`npm audit fix` was tried first, but it also raised ESLint and
typescript-eslint, which have nothing to do with either advisory, so the two
packages were updated on their own instead.

**Does it apply here?**
- **`body-parser`: yes.** `express.json()` (`app.ts`) runs with its defaults,
  which decompress gzip and deflate request bodies, so any client could reach
  the vulnerable path. An encoding it can't read is already refused with `415`
  (#103), but gzip and deflate are ones it reads.
- **`ip-address`: probably not.** `express-rate-limit` uses it for IPv6
  addresses in the per-IP limits (#71). Those addresses come from `req.ip`,
  not from text the client chooses, so a long zone identifier is unlikely to
  reach it. It is fixed anyway, since the fix is a patch release.

**What remains:** the 19 are all development-only, through Vitest 2 and its
tooling (#101). They run only against our own tests, on our machines and in
CI, and never ship with the app. Accepted, as before.

All 503 server unit tests pass, and typecheck and lint are clean, on the new
versions.

## 2026-10-21 (Milestone 2 review, issue #65)

The re-run this file asks for at each milestone, done with the OWASP review
([`owasp-review.md`](./owasp-review.md), A03). `npm audit` in both
workspaces, before and after `npm audit fix`, which was run **without**
`--force`, so no major version changed:

| Workspace | Scope | Before | After |
|---|---|---|---|
| `server/` | production (`--omit=dev`) | 9 (1 critical, 5 high, 3 moderate) | **0** |
| `server/` | all, dev included | 16 (4 critical, 6 high, 6 moderate) | 7 (3 critical, 1 high, 3 moderate) |
| `client/` | production | 0 | 0 |
| `client/` | all, dev included | 9 (3 critical, 3 high, 3 moderate) | 7 (3 critical, 1 high, 3 moderate) |

**What changed:** `express` 4.22.2 → 4.22.3, which brings `qs` 6.16.1 and
`proxy-addr` 2.0.8, and Prisma 7.10.0 → 7.10.1 (`prisma`, with
`@prisma/client` and `@prisma/adapter-pg` raised to match). Through Prisma's
CLI, the `mysql2`, `deepmerge-ts` and `fast-uri` advisories below are fixed
too. On the client, `brace-expansion`, `source-map-js`, and `vite` 6.4.3 → 6.4.5, still on
the Vite 6 line (all build and test tooling). All 423
server unit tests, the integration tests, both builds and the 91 client tests
pass on the new versions.

This closes the two open items from the entries below: **`qs`** (September 9,
"accept for now") and **`proxy-addr`** (October 7, critical) are both fixed
within Express 4.

**What remains: 7 per workspace, all development-only, all through Vitest
2.1.9.** `vitest`, `@vitest/mocker` (path traversal through a redirect mock,
fixed in 4.1.11), `tinypool` (prototype pollution in worker options),
`vite`, `vite-node`, `esbuild` and `@vitest/coverage-v8`. They run only
against our own test files, on our machines and in CI, and never ship with
the app. **Accepted** for Milestone 2. Vitest 3.2 was checked as a middle
step: it still carries four of them, so the fix is Vitest 4.1.11 or later,
which depends on Rolldown (environment note below). Filed as #101.

### Decision on Express 5

**Stay on Express 4 (4.22.3) for Milestone 2; revisit at Milestone 3.** The
September entry put this off until it could be tried against a passing test
suite. Tried on October 21, with `express@5.3.0` and `@types/express@5`:

- All 423 server unit tests and all integration tests **pass** unchanged.
- `tsc` reports **5 errors**, all the same: Express 5's types give route
  parameters as `string | string[]` (`require-household-member.ts`,
  `chore.routes.ts`, `expense.routes.ts`).

The security reason to move, `qs`, is gone now that 4.22.3 fixes it. The
upgrade itself looks small, but it isn't worth doing in the week of the
feature freeze (October 28), with three open pull requests changing routes.
The trial was reverted; nothing in this change uses Express 5.

## 2026-11-02 (component tests, issue #76)

Checked before adding four devDependencies to `client/` for the component
tests: `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2 (its
peer), `@testing-library/user-event` 14.6.8, and `jsdom` 29.1.1. Each version
is the newest that is at least two weeks old. jsdom is held at 29 because 30
requires Node 22, and CI runs Node 20. Full `npm audit` in `client/`, dev
dependencies included:

| Workspace | Before | After | Added |
|---|---|---|---|
| `client/` | 22 (3 critical) | 22 (3 critical) | the four above |
| `client/`, production only | 0 | 0 | |

None of the four brings an advisory; the 22 are the existing dev-tooling ones
through Vitest 2 (#101). They run only in tests, on the developer's machine
and in CI, and never ship with the app. Accepted.

## 2026-10-12 (@vitest/coverage-v8, issue #62)

Checked before adding `@vitest/coverage-v8` 2.1.9 to both workspaces as a
devDependency, pinned to the same 2.1.9 as Vitest (see the environment note
below). Full `npm audit`, dev dependencies included:

| Workspace | Before | After | Added |
|---|---|---|---|
| `server/` | 15 (3 critical) | 16 (4 critical) | `@vitest/coverage-v8` |
| `client/` | 8 (2 critical) | 9 (3 critical) | `@vitest/coverage-v8` |

The one new entry in each is `@vitest/coverage-v8` itself, and its only
advisory is `via: vitest`: it is listed because it depends on Vitest 2.1.9,
whose existing advisories (`vitest`, `tinypool`, `vite`) were already counted.
It adds no vulnerable code of its own. It runs only while measuring coverage,
on the developer's machine and in CI, and never ships with the app. Accepted.
Moving off the Vitest 2 line is part of the Milestone 2 review (#65).

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
