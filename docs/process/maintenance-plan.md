# Maintenance and support plan

How RoomSync is kept running, kept current and kept safe once it is deployed:
who does what, how often, and what to do when something goes wrong. Tracked in
#120. The risks behind it are in the [risk register](./risk-register.md); the
security controls it maintains are in the [threat model](../security/threat-model.md)
and the [OWASP review](../security/owasp-review.md), which it doesn't repeat.

**Status, November 3, 2026.** The application is not deployed yet (#117, due
November 10). Sections that depend on the host say **To complete in #117** and
list what to record there. Everything else describes how the project already
works.

## 1. Who supports it

| Area | Owner | Backup |
|---|---|---|
| Hosting, deployment, CI/CD, secrets | Agustin | Orlando |
| Database schema, migrations, seed data | Orlando | Agustin |
| Dependencies and security advisories | Both, alternating each audit | — |
| Bug reports and triage | Whoever finds or receives it | The other reviews the fix |
| Documentation (README, this plan) | Orlando | Agustin |

The backup column follows the proposal's rule that both members work across the
whole stack, so either can act when the other is away. Branch protection still
needs both people for anything to merge to `main` (risk register, 16).

## 2. Keeping dependencies current

- **When:** at every milestone, and before adding any new dependency.
- **How:** `npm audit` in `server/` and `client/`, production-only and with
  development dependencies. Each audit is recorded as a dated entry in
  [`dependency-audit.md`](../security/dependency-audit.md): the counts, what
  changed, and a decision for each advisory that remains.
- **Fixing:** `npm audit fix` **without** `--force`, then every test suite. A fix
  that needs a major version is a decision, not a routine update. It gets an
  issue and its own pull request. Express 5 is the example
  (`dependency-audit.md`, "Decision on Express 5").
- **Automated alerts:** Dependabot alerts and security updates, plus GitHub
  Actions pinned to commit SHAs, are #100. Until that lands, nothing announces
  a new advisory between audits.
- **The test toolchain** stays on Vite 6 and Vitest 2 because of a machine
  constraint (risk register, 18). #101 tracks moving off it.

## 3. Reporting and fixing bugs

The full procedure is the QA plan's defect handling
([`qa-plan.md`](../testing/qa-plan.md) §5). In short:

1. **Report:** open an issue labelled `bug`, with what was expected, what
   happened instead, and the steps to reproduce it.
2. **Triage:** `P0` if it breaks a P0 story, gives a wrong amount of money, or is
   a security flaw; `P1` otherwise. A `P0` bug blocks a release.
3. **Fix:** a `fix:` pull request with `Closes #N`, and a test that fails without
   the fix, so the defect can't quietly come back.
4. **Release:** the fix reaches users on the next deployment from `main` (§5).

A security problem is reported the same way, but without exploit details in the
public issue; send those to the other member directly.

## 4. Releases and versions

- `CHANGELOG.md` follows Keep a Changelog, and versions follow SemVer, at `0.x`
  until `v1.0.0` at Milestone 3. Every pull request adds its line under
  `[Unreleased]`.
- **Cutting a release:** move `[Unreleased]` to a new version section in its own
  pull request, then tag **that pull request's merge commit** and publish the
  GitHub release with the section as its notes. `milestone-2` landed one commit
  early, so this order matters (risk register, 17).
- After `v1.0.0`: `1.0.x` for fixes, `1.x.0` for features.

## 5. Deploying

**To complete in #117 and #118.** Record:

- where it runs: the Render services, the region, the plan (free or paid), and
  the public URL
- how a deployment happens: CD deploys `main` after the three CI jobs pass
  (#118), and how to trigger one by hand
- how to **roll back**: redeploying the previous version on Render, and when
  rolling back isn't enough (below)
- the health check, `GET /api/health`, and what watches it

**Migrations** run on deploy with `prisma migrate deploy`, and are forward-only.
To undo a migration, write a new one that reverses it, never edit one that has
run. Rolling the code back without reversing a migration that removed or
renamed a column will break the older code. So far every migration has only
added columns, which older code ignores.

## 6. Configuration and secrets

Production configuration lives only in the host's environment settings and
GitHub's secret store, never in the repository. The variables are the ones in
[`server/.env.example`](../../server/.env.example) and the README's
Environment variables table, with `NODE_ENV=production`.

**Rotating `SESSION_SECRET`**, if it may have leaked:

1. Generate a long random value, and set it as `SESSION_SECRET` on the host.
2. Redeploy. Every existing session cookie is signed with the old secret, so
   **every user is signed out** and must log in again. That's the intended
   effect after a leak.
3. Record the date and reason (not the value) in the deployment log (§5).

Rotating without signing everyone out would need the server to accept a list of
secrets, newest first. `express-session` supports this, but
`server/src/middleware/session.ts` passes one secret today, so it would be a code
change.

**Rotating the database password or the deploy hook:** change it at its source
(Render), update the matching secret, and redeploy. **To complete in #117 and
#118** with the exact steps.

## 7. Backups and restoring data

**To complete in #117.** Record what the host provides for the managed
PostgreSQL on the chosen plan (automatic backups, how long they are kept,
point-in-time recovery or not), and test a restore once:

1. Take or choose a backup.
2. Restore it into a **separate** database, never over production.
3. Point a local server at it, and check the seed accounts and a balance.
4. Write down how long it took.

If the plan has no backups, take a manual `pg_dump` before every migration and
before the live demo, and keep it outside the host.

**Last resort:** `npm run db:seed` rebuilds the demonstration household from
`server/src/seed-data.ts`. The seed refuses to run when `NODE_ENV` is
`production`, so a rebuild has to be deliberate. It restores the demo, not
anyone's real data.

## 8. Monitoring

- **Today:** `GET /api/health` answers `{"status":"ok"}`, and CD will check it
  after every deploy (#118). The server logs unexpected errors (`500`), never a
  stack trace or a database message in the response.
- **Not yet:** security events (failed logins, rate limits reached, refused
  requests) aren't logged. That's #99 (risk register, 22).
- **To complete in #117:** where the host's logs are read, and how long they
  are kept.

## 9. After the semester

RoomSync is a course project. After Milestone 3 is graded:

- **The repository** stays public, with `v1.0.0` tagged, as the record of the work.
- **The deployment** stays up while the free tier allows, and is then shut down
  deliberately: delete the database (after a final `pg_dump` if anyone wants it),
  remove the secrets, and change the README's URL to say it's no longer live.
- **No support is promised** after the course. Issues may be answered, but
  without a response time.
- **Dependencies stop being audited** once the deployment is shut down. Anyone
  running it later should start with §2.

## 10. Known limitations

What a user or a maintainer should know at `v1.0.0`, kept in step with the
README's Known limitations section (#122):

- **US-13 is unfinished** unless #74 lands: a member can't be removed from a
  household, or leave one.
- **One household per user.** The schema allows more; the service refuses it
  (analysis model §7).
- **Expenses can be edited and soft-deleted; settlements can't.** A payment
  recorded by mistake can't be corrected in the app.
- **Who entered a record** is known only for records created after #90.
- **No email:** invitation links are shared by hand, and there's no password reset.
- **Rate limits** are counted in memory, on one instance (risk register, 21).
- **Development-only advisories** remain through Vitest 2 (#101).
- **Tested on** Chrome, Edge, Firefox and an iPhone. Not tested on an Android
  phone or desktop Safari (`docs/design/responsive-design.md` §5).
- **Hosting:** free-tier limits such as cold starts. **To complete in #117.**
