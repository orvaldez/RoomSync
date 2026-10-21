# OWASP Top 10 review

Each category of the **OWASP Top 10:2025**, the current edition, checked
against RoomSync's code on `main` on October 21, 2026: whether it applies, the
evidence for how RoomSync handles it, and what gaps were found. Every gap is
either fixed in #65 or filed as an issue. Tracked in #65.

This review and the [threat model](./threat-model.md) (#70) cover the same
ground from two sides. The threat model starts from RoomSync's attack surfaces
and asks what could go wrong with each; this review starts from the industry's
list and asks whether RoomSync has each weakness. Threat ids such as **H1** or
**S4** refer to the threat model's rows.

## Summary

| # | Category | Relevant? | Verdict | Gaps |
|---|---|---|---|---|
| A01 | Broken Access Control | Yes, the main risk | **Handled** | H4 (#90), I2 (#75, #74) already filed |
| A02 | Security Misconfiguration | Yes | **Fixed in #65** | Client headers at deployment: #102 |
| A03 | Software Supply Chain Failures | Yes | **Fixed in #65**, with an accepted residual | Dev-only Vitest advisories: #101. Automated alerts: #100 |
| A04 | Cryptographic Failures | Yes | **Handled** | None new |
| A05 | Injection | Yes | **Handled** (re-checked, as the threat model asked under M3) | None |
| A06 | Insecure Design | Yes | **Handled, with known items filed** | H3 (#73), H4 and M4 (#90) |
| A07 | Authentication Failures | Yes | **Handled** | Accepted: A2 enumeration, 14-day sessions |
| A08 | Software or Data Integrity Failures | Partly | **Handled** | Actions pinned by tag, not SHA: #100 |
| A09 | Security Logging and Alerting Failures | Yes | **Gap** | No security events are logged: #99 |
| A10 | Mishandling of Exceptional Conditions | Yes | **Fixed in #65** | None left |

## A01:2025 Broken Access Control

**Relevant.** Every record belongs to a household, and the main risk in a
multi-tenant app is one tenant reading or changing another's data.

- **Membership checked on every request, from the database.** Every
  `/households/:householdId/...` route runs `requireAuth` and then
  `requireHouseholdMember` (`server/src/middleware/require-household-member.ts`),
  which reads the requester's role for that household in the same request.
  Nothing about membership is cached in the session.
- **404, not 403, for someone outside the household.** `requireMembership`
  (`server/src/services/household.service.ts`) answers a non-member exactly as
  it answers a household that doesn't exist, so the API can't be used to learn
  which households exist (threat model H1). An expense or chore id from
  another household, sent under the requester's own household, is
  `EXPENSE_NOT_FOUND` or `CHORE_NOT_FOUND` because every query filters on both
  ids (`findInHousehold` in `server/src/repositories/expense.repository.ts`).
- **Roles from the database, not the client.** Inviting is owner-only
  (`NOT_HOUSEHOLD_OWNER`, H2); completing a chore is assignee-only
  (`CHORE_NOT_ASSIGNED_TO_YOU`).
- **The server decides, whatever the client shows.** The client hides
  actions a user can't take, but each is also refused by the server.
- **Tested against PostgreSQL.** `server/src/integration/household.integration.test.ts`
  checks the members 404. #95 (in review) adds `isolation.integration.test.ts`,
  which sends every household-scoped endpoint as a user from another household
  and expects `404 HOUSEHOLD_NOT_FOUND` from all of them.
- **Server-side request forgery,** which 2025 folds into A01: **not relevant.**
  The server never fetches a URL supplied by a user.

**Gaps:** both were found by the threat model and are already filed.
**H4**: any member can record a settlement between two *other* members, so
the payer-or-recipient restriction lives only in the interface (#90). **I2**:
a leaked invitation link can't be cancelled, and the wrong person can't be
removed (#75, #74).

## A02:2025 Security Misconfiguration

**Relevant.** This was the threat model's **S4** and part of **A4**.

Found on `main` before this review: every response carried
`X-Powered-By: Express` and none of the usual security headers (checked with
Supertest against `GET /api/health`).

**Fixed in #65:**

- `app.disable("x-powered-by")` (`server/src/app.ts`).
- `server/src/middleware/security-headers.ts`, mounted before everything else
  so errors and 404s carry it too. Because the API only answers JSON, the
  policy can be strict: `Content-Security-Policy: default-src 'none';
  frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Resource-Policy: same-origin`, and `Cache-Control: no-store`
  so one household's figures don't sit in a shared cache. In production only,
  `Strict-Transport-Security`, tied to the same `isBehindTlsProxy` switch as
  the secure cookie.
- `server/src/middleware/security-headers.test.ts` checks the headers on a
  success, a 401 and a 400, that `X-Powered-By` is gone, and that HSTS appears
  only in production.

**Already in place:**

- **Errors don't leak internals.** Anything unexpected is a generic
  `500 INTERNAL_ERROR`, never a stack or a database message
  (`server/src/middleware/error-handler.ts`).
- **`trust proxy` is on only in production** (`server/src/app.ts`), so in
  development nobody can spoof their IP through `X-Forwarded-For`, which
  matters because the rate limits are per IP. In production it trusts one hop,
  by count rather than by subnet.
- **No CORS headers.** The client reaches the API through the same origin (the
  Vite proxy in development), so no other site's scripts can read responses.
- **Safe defaults that refuse to start.** The server won't start without
  `SESSION_SECRET`, and in production won't start with the example value
  (`server/src/middleware/session.ts`). The seed refuses to run in production.

**Gap filed:** the client's own headers, including a Content-Security-Policy,
belong to whatever serves the built client at Milestone 3 (#102).

## A03:2025 Software Supply Chain Failures

**Relevant.** New in 2025; covers vulnerable and outdated components.

- **The audit, re-run.** `npm audit` in both workspaces on October 21; the
  full results are in [`dependency-audit.md`](./dependency-audit.md).
  - Server, production dependencies: **9 advisories (1 critical, 5 high,
    3 moderate) → 0.** `npm audit fix` without `--force` raised `express` to
    4.22.3 (with `qs` 6.16.1 and `proxy-addr` 2.0.8) and Prisma to 7.10.1. No
    major version changed. All 423 server unit tests and the integration tests
    pass on the new versions.
  - Client, production dependencies: 0 before and after.
  - Development only, in each workspace: 7 remain, all through Vitest 2.1.9
    (`vitest`, `@vitest/mocker`, `tinypool`, `vite`, `vite-node`, `esbuild`,
    `@vitest/coverage-v8`). They run only against our own test files, on our
    machines and in CI, and never ship. **Accepted** for now. Vitest 3.2 still
    carries four of them (checked), so the fix is Vitest 4.1.11 or later, which
    is blocked on one team member's machine. Filed as #101.
- **Express 5: decided, not now.** The `qs` advisory was the reason to consider
  it, and 4.22.3 fixes it. Tried on October 21: all 423 unit tests and the
  integration tests pass on Express 5.3.0, and `tsc` reports 5 errors, all the
  same kind (route parameters typed `string | string[]`). It is a small
  upgrade, but not one to make the week of the feature freeze, with three
  open PRs changing routes. Revisit at Milestone 3.
- **Pinned and reproducible.** Both workspaces commit `package-lock.json`, and
  CI installs with `npm ci`, which fails if the lockfile and `package.json`
  disagree.
- **Every dependency is reviewed when added,** with the audit before and
  after recorded (the October 7 and 12 entries in `dependency-audit.md`).

**Gaps filed:** no automated alerts between manual audits, so a new advisory
against an installed package waits for the next milestone (#100). The Vitest 2
advisories (#101).

## A04:2025 Cryptographic Failures

**Relevant.**

- **Passwords:** bcrypt at cost 10 (`BCRYPT_COST`,
  `server/src/services/auth.service.ts`), with bcrypt's 72-byte input limit
  enforced rather than silently truncated (`validatePassword`,
  `server/src/services/validation.ts`). The hash never leaves the server: user
  queries select only names (`EXPENSE_INCLUDE`), and tests check registration's
  response contains neither the password nor the hash.
- **Session cookie:** signed with `SESSION_SECRET`; `httpOnly`, `SameSite=Lax`,
  and `Secure` in production (`server/src/middleware/session.ts`, threat model
  A4 and A6).
- **Invitation tokens:** 32 bytes from `crypto.randomBytes` (I1).
- **In transit:** HTTPS is the host's job at Milestone 3. The secure cookie and,
  since #65, HSTS are already switched on for production.
- **At rest:** the database isn't encrypted by the app. Invitation tokens and
  session ids are stored as-is (threat model I3, S1), accepted because a copy
  of the database already exposes every household's data.

**Gaps:** none new.

## A05:2025 Injection

**Relevant.** Re-checked, as the threat model asked (M3).

- **SQL:** every query goes through Prisma, which sends values as bound
  parameters. A search of `server/src` for `$queryRaw`, `$executeRaw` and
  `Unsafe` finds exactly one raw statement: the ledger lock in
  `server/src/repositories/ledger.repository.ts`,
  `` $executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_NAMESPACE}::int, hashtext(${householdId}))` ``.
  It is Prisma's tagged template, which also binds both values as
  parameters, and `householdId` comes from a URL already checked against the
  requester's memberships. No `$queryRawUnsafe` or `$executeRawUnsafe` exists.
  The integration tests' own SQL (`server/src/integration/`) uses `pg` with
  `$1` parameters. Its one interpolated statement, `TRUNCATE` in
  `test-database.ts`, uses table names read from `pg_tables`, never input.
- **HTML and script injection (XSS):** React escapes every value it renders,
  and a search of `client/src` finds no `dangerouslySetInnerHTML`,
  `innerHTML` or `eval`. The API sends JSON with `nosniff` (A02).
- **Command injection:** the server runs no shell commands.

**Gaps:** none.

## A06:2025 Insecure Design

**Relevant.** Design flaws are the ones tests of the code as written don't
catch.

- **Money is exact.** Integer cents, splits that must add up with no silent
  adjustment, and balances derived from the records on every read rather
  than stored (NFR-03, threat model M1).
- **Races are designed out.** Every write that changes a balance takes a
  per-household advisory lock, and the settlement check runs inside it (M2).
- **Abuse limits.** Login and registration are rate-limited (#71).
- **Threat-modelled.** The threat model (#70) drove three design issues.

**Known items, filed:** the one-household-per-user check isn't atomic (**H3**,
#73); a member can record a settlement between two others, and nothing
records who entered a record (**H4**, **M4**, #90). Editing and deleting
expenses (#60, in review in #98) settles who may change a record: the payer or
the owner. A delete is soft and records who did it (threat model M5).

## A07:2025 Authentication Failures

**Relevant.**

- **Guessing passwords:** at most 5 wrong passwords per account and 20 per IP
  per 15 minutes, then `429 RATE_LIMITED` with `Retry-After`
  (`server/src/middleware/rate-limit.ts`, #71, with before-and-after evidence
  in [`rate-limiting.md`](./rate-limiting.md)).
- **Session fixation:** the session id is regenerated at login
  (`regenerateSession`, `server/src/routes/auth.routes.ts`, threat model A3).
- **Logout ends the session on the server**, not just the cookie:
  `session.destroy` deletes the row, checked against PostgreSQL in
  `server/src/integration/auth.integration.test.ts`.
- **Account enumeration at login:** the same code, message and timing for an
  unknown email as for a wrong password (`DUMMY_HASH`, A2).
- **Weak passwords:** at least 8 characters (`validatePassword`).

**Accepted, from the threat model:** registration's `409` confirms that an
address has an account, one rate-limited request at a time (A2). Sessions last
14 days with no idle timeout (A4). There's no breached-password check (A1).

## A08:2025 Software or Data Integrity Failures

**Partly relevant.** RoomSync has no plugins, auto-updates or deserialization
of untrusted objects.

- **Data integrity:** the session cookie is signed. Request bodies are parsed
  only as JSON, and every field is validated before use.
- **Code integrity:** changes reach `main` only through a reviewed pull
  request with the CI checks passing (the **Protect main** ruleset,
  `docs/process/branch-protection.md`). Installs use the committed lockfiles.

**Gap filed:** CI uses GitHub Actions by tag (`actions/checkout@v5`), and a
tag can be moved. Pinning to commit SHAs is part of #100.

## A09:2025 Security Logging and Alerting Failures

**Relevant, and a gap.**

The server logs one thing: unexpected errors, with `console.error` in
`server/src/middleware/error-handler.ts`. Nothing records a failed login, a
rate limit being reached, a refused `403`, or a `404` from another household.
A password-guessing run, or a member probing the API with other households'
ids, leaves no trace and could trigger no alert.

**Filed as #99:** a small structured logger for those security events. It
must never log a password, a session id, a cookie or an invitation token. Its
target is Milestone 3, when there is a host to collect the logs.

## A10:2025 Mishandling of Exceptional Conditions

**Relevant.** New in 2025: errors that leave the app failing open, leaking
detail, or answering the wrong way.

Found on `main` before this review: a request body over Express's 100 KB
limit, or with an unknown `Content-Encoding`, was answered
**`500 INTERNAL_ERROR`** and logged as an unhandled bug (checked with
Supertest). These are the client's errors, so the status was wrong, and anyone
could fill the error log on purpose.

**Fixed in #65:** `server/src/middleware/error-handler.ts` now recognises the
request parser's client errors (a 4xx `status` with `expose: true`) and answers
`413 PAYLOAD_TOO_LARGE` or `415 UNSUPPORTED_MEDIA_TYPE` (anything else of that
kind is `400 BAD_REQUEST`), in the contract's error shape, without logging.
`server/src/middleware/error-handler.test.ts` checks both, and that malformed
JSON is still `400 INVALID_JSON`.

**Already in place:**

- **Async errors reach the handler.** Every async route is wrapped in
  `asyncHandler` (all 22; `GET /api/health` is synchronous), so a rejected
  promise becomes a `500` in the contract's shape rather than a hung request.
- **Fails closed.** An unexpected error in the membership guard or the session
  lookup ends the request with an error; it never falls through to the route.
- **Writes are all-or-nothing.** An expense and its shares, and a settlement and
  its balance check, are each one transaction, so a failure part-way stores
  nothing (UC-05 10a).
- **Database constraint errors are translated,** not leaked: a duplicate email
  becomes `409 EMAIL_UNAVAILABLE` (`server/src/repositories/errors.ts`).

**Gaps:** none left.

## Filed from this review

| Gap | Category | Issue |
|---|---|---|
| No security events logged | A09 | #99 |
| No automated dependency alerts; Actions pinned by tag | A03, A08 | #100 |
| Dev-only advisories through Vitest 2 | A03 | #101 |
| Security headers and a CSP for the deployed client | A02 | #102 |

Fixed in #65 itself: the API's security headers and `X-Powered-By` (A02,
threat model S4 and part of A4); the production dependency advisories (A03);
client errors answered as 500s (A10).
