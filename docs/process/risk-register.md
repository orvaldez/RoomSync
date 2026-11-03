# Risk register

The risks to RoomSync as a project, and what happened to each. It starts from
the proposal's risk table (§11) and records how each risk actually played out,
with evidence, then adds the risks found since. Tracked in #120.

This register is about **delivering and running** the project. Attacks on the
application are in the [threat model](../security/threat-model.md) and the
[OWASP Top 10 review](../security/owasp-review.md), and are only summarized
here (risk 9).

**How to read it.** *Likelihood* and *impact* are the proposal's estimates,
revised where events showed them wrong. *Status* is one of:
- **Occurred:** it happened; the evidence says how much it cost.
- **Mitigated:** the mitigation is in place and the risk has not occurred, or
  no longer can.
- **Open:** still possible, with a plan.
- **Accepted:** known, deliberately not mitigated further, with the reason.

Owners follow the proposal's §10: Agustin owns deployment, containers and CI;
Orlando owns the schema, the README and quality reporting; process risks are
shared.

*Last reviewed: November 3, 2026, at the start of Sprint 5.*

## Summary

| # | Risk | Category | Likelihood | Impact | Owner | Status |
|---|---|---|---|---|---|---|
| 1 | Scope becomes too large | Scheduling | Medium | High | Both | **Mitigated**; one story slipped |
| 2 | The team falls behind schedule | Scheduling | Medium → **High** | High | Both | **Occurred** twice |
| 3 | One member becomes unavailable for a period | Team | Medium | High | Both | **Occurred**, as a review gap |
| 4 | Unequal workload between members | Team | Medium | High | Both | **Mitigated** |
| 5 | Database design problems | Technical | Medium → Low | Medium | Orlando | **Mitigated** |
| 6 | Incorrect balances from rounding | Data | Medium | High | Orlando | **Mitigated** |
| 7 | Concurrent actions produce inconsistent data | Data | Low | Medium | Both | **Occurred** once, fixed |
| 8 | Merge conflicts | Technical | Medium → **High** | Medium → Low | Both | **Occurred**, managed |
| 9 | Authentication or authorization vulnerabilities | Security | Medium | High | Both | **Mitigated**, two fixes |
| 10 | Application defects | Technical | Medium | Medium | Both | **Occurred**, caught before release |
| 11 | Deployment problems | Deployment | Medium | High | Agustin | **Open** |
| 12 | Free hosting tier limitations | Deployment | Medium | Low | Agustin | **Open** |
| 13 | GitHub or Render unavailable near a deadline | Deployment | Low | Medium | Agustin | **Occurred** once, mitigated |
| 14 | Data loss | Data | Low | High | Agustin | **Open** (production) |
| 15 | Requirements change significantly | Scheduling | Low | Medium | Both | **Mitigated** |
| 16 | Review becomes a bottleneck | Process | **High** | High | Both | **Occurred**; new rules |
| 17 | A release or merge lands on the wrong commit or branch | Process | Medium | Medium | Both | **Occurred** twice; new rules |
| 18 | The test toolchain can't be upgraded on one machine | Technical | Certain | Low | Both | **Accepted** |
| 19 | AI-generated changes merged without being understood | Process | Medium | High | Both | **Mitigated** |
| 20 | A production secret leaks | Security | Low | High | Agustin | **Open** |
| 21 | Rate limits reset or split when the server restarts or scales | Security | Medium | Low | Agustin | **Accepted** |
| 22 | Security events go unnoticed | Security | Medium | Medium | Orlando | **Open** (#99) |

## The proposal's risks, revisited

### 1. Scope becomes too large

- **Mitigation (proposal):** fix the MVP and treat every other feature as
  optional until the required work is done.
- **What happened:** it held. Milestone 1 shipped all ten P0 stories, the full
  MVP rather than a reduced one. Milestone 2 shipped its three P0 stories
  (US-11, US-12, US-14). Its one P1 story, US-13 (#74), slipped to Milestone 3,
  which is what P1 is for (`BACKLOG.md`). A new idea, recurring chores (US-15,
  #93), was kept out of the plan rather than squeezed in.
- **Status:** **Mitigated.** The P0/P1 split, redefined for Milestone 2 as
  "graded now" versus "can slip", is what made the slip harmless.

### 2. The team falls behind schedule

- **Mitigation (proposal):** two-week sprints aligned to milestones, with all
  work tracked as issues.
- **What happened:** twice. In Sprint 1, none of the three planned stories
  started; the sprint went to the foundation instead, and Sprint 2 carried the
  whole P0 set (`BACKLOG.md`, Sprint 1 outcome). In Sprints 3 and 4, the work
  kept to its dates but merging did not: nothing merged between October 15 and
  November 1, and 14 pull requests merged on November 2, the due date
  (`docs/process-model.md` §8).
- **Revised likelihood:** **High.** Both times the milestone still shipped
  complete, so the impact landed on stress and rework, not on the grade.
- **Status:** **Occurred.** For Milestone 3: the first deployment moved to the
  start of Sprint 5 (November 10) and the feature freeze to a full week before
  the due date (November 23).

### 3. One member becomes unavailable for a period

- **Mitigation (proposal):** both members work full-stack and review each
  other's code, so either can pick up the other's area.
- **What happened:** the mitigation worked for **building** and not for
  **merging**. During Sprint 4, review requests waited for over a week, while
  work carried on: five pull requests (#95 to #98, #103) were finished and
  waiting by October 21.
  Branch protection, which requires the other member's approval, meant none
  could merge until both were available, on November 2. The proposal's
  mitigation assumed either member can do the other's work; it didn't cover
  the one thing only the other member can do.
- **Status:** **Occurred**, as a review gap rather than lost work. See risk 16
  for the response.

### 4. Unequal workload between members

- **Mitigation (proposal):** track contributions through issues and pull
  requests, and rebalance at the next sprint boundary.
- **What happened:** balanced. `git shortlog -sn` counts 15 commits for Agustin
  and 11 for Orlando from `milestone-0` to `milestone-1`, and 14 and 13 from
  `milestone-1` to `milestone-2`. Ownership moved when it needed to: the
  balances and dashboard stories moved to Agustin in Sprint 2, and #113
  re-applied Agustin's evidence after a merge went to the wrong branch.
- **Status:** **Mitigated.** The Milestone 3 plan splits the work along the
  proposal's §10 (`BACKLOG.md`).

### 5. Database design problems

- **Mitigation (proposal):** design the entities early, review the schema
  before implementation, and change it only through Prisma migrations.
- **What happened:** the schema from Sprint 1 has held. Three migrations
  through Milestone 2 (the initial schema, the session table, and editing and
  soft-deleting expenses), each adding to the design rather than reworking it;
  #90 adds a fourth. Two decisions made early paid off later: there is no
  stored balance (analysis model §3.1), so editing and deleting expenses needed
  no data migration, and the `REVOKED` invitation status existed before
  revoking was built, so US-14 needed none either.
- **Revised likelihood:** **Low.**
- **Status:** **Mitigated.**

### 6. Incorrect balances from rounding

- **Mitigation (proposal):** integer cents (FR-18), balances derived from the
  records (NFR-03), and unit tests for splits that don't divide evenly.
- **What happened:** no rounding defect has been found. The split arithmetic
  is integer-only, the split service has 41 tests including the remainder-cent
  cases, its coverage target is the highest in the project (95% statements,
  `docs/testing/coverage.md`), and the integration tests check every split
  method's balances against amounts worked out by hand
  (`server/src/integration/money.integration.test.ts`).
- **Status:** **Mitigated.**

### 7. Concurrent actions produce inconsistent data

- **Mitigation (proposal):** check on the server that a settlement can't exceed
  the balance, and enforce integrity in the database.
- **What happened:** the risk the proposal named, two settlements racing past
  the balance check, was designed out from the start: every write that changes
  a balance takes a per-household advisory lock (threat model M2). A different
  race, which the proposal didn't name, did exist: two requests at once could
  put one user in two households. It was found in review of #39, accepted for
  Milestone 1, and fixed in #111 with a per-user lock and a concurrent test that
  fails without the fix (`docs/security/one-household-race.md`).
- **Status:** **Occurred** once, **fixed**.

### 8. Merge conflicts

- **Mitigation (proposal):** short-lived branches, pull requests, and branches
  kept current with `main`.
- **What happened:** frequent, but small. Shared files conflict whenever two
  pull requests touch them: `CHANGELOG.md`, `README.md`, `BACKLOG.md`, the API
  contract and `services/errors.ts`. The rule "keep both sides"
  (`BACKLOG.md`, working rules) resolved nearly all of them. The costly ones
  came from merging many pull requests on one day: a changelog entry landed
  under the wrong release twice.
- **Revised:** likelihood **High**, impact **Low**: they happen often and cost
  little, except when merges are batched (risk 16).
- **Status:** **Occurred**, managed.

### 9. Authentication or authorization vulnerabilities

- **Mitigation (proposal):** established practice, bcrypt, household scoping on
  every request, server-side validation.
- **What happened:** the scoping held everywhere it was tested: a user from
  another household gets 404 from every household endpoint, checked against
  PostgreSQL (`server/src/integration/isolation.integration.test.ts`). The threat
  model (#70) found two real weaknesses, both since fixed: unlimited login
  attempts (rate limiting, #71) and any member being able to record a payment
  between two others (#90). The OWASP review (#65) fixed missing security
  headers and requests answered with 500 instead of 4xx.
- **Status:** **Mitigated.** The detail and residual risks are in the
  [threat model](../security/threat-model.md); risks 20 to 22 below cover what
  is still open.

### 10. Application defects

- **Mitigation (proposal):** automated unit and integration tests in CI, plus
  manual testing.
- **What happened:** defects occurred and were caught before release, each by a
  different layer:
  - **the real iPhone:** date fields overflowing their column (#106, fixed in
    #107) and crowded wrapped headings (#109, open)
  - **the README fresh-clone check:** a walkthrough step that couldn't be
    followed after the step before it (fixed in #104)
  - **the OWASP review:** oversized request bodies answered as `500` (#103)
  - **CI on a combined branch:** a component test that broke once a parallel
    pull request (#105) merged (#112)

  CI now runs 673 automated tests and blocks a merge when any fails.
- **Status:** **Occurred**, caught before release. No P0 bug is open.

### 11. Deployment problems

- **Mitigation (proposal):** deploy a basic version well before the final
  milestone, and containerize so local and deployed environments match.
- **What happened:** not yet deployed. Milestone 3's plan follows the proposal:
  containers by November 7 (#116), the first live deployment by November 10
  (#117), CD by November 12 (#118), three weeks before the due date.
- **Status:** **Open.** Known areas to check: the secure cookie and `trust
  proxy` over Render's HTTPS proxy (`server/src/middleware/session.ts`),
  migrations on deploy, and the client's `/api` proxy in production.

### 12. Free hosting tier limitations

- **Mitigation (proposal):** warm the app before a demonstration, and consider a
  low-cost paid tier if the free database tier is too small.
- **What happened:** not yet deployed. #117 records the free tier's actual
  limits once the service exists, and the demo script (#124) includes warming
  the site up.
- **Status:** **Open.**

### 13. GitHub or Render unavailable near a deadline

- **Mitigation (proposal):** the app runs locally through Docker Compose,
  independent of either service.
- **What happened:** once, from a direction the proposal didn't name: CI's
  integration job couldn't pull the PostgreSQL image from Docker Hub ("Data
  limit exceeded"). It moved to Amazon's public mirror (#89). The mirror refused
  once too, on October 12, and a re-run passed. The application itself was
  never affected.
- **Status:** **Occurred** once, mitigated. The local Compose setup (#116) is
  also the live demo's fallback (#124).

### 14. Data loss

- **Mitigation (proposal):** the host's database backups, and seed data to
  rebuild a working database.
- **What happened:** there is no production data yet. Locally, the seed rebuilds
  the demonstration household in one command and refuses to run in production.
- **Status:** **Open** until #117. The backup and restore procedure goes in the
  [maintenance plan](./maintenance-plan.md) once the host exists.

### 15. Requirements change significantly

- **Mitigation (proposal):** Agile prioritization within the original MVP scope.
- **What happened:** the requirements held. Milestone 2's stories came from the
  proposal's own later-features list (history, editing expenses, removing
  members, revoking invitations), not from new scope.
- **Status:** **Mitigated.**

## Risks found since the proposal

### 16. Review becomes a bottleneck

- **Cause:** with two people, every pull request needs the one other person,
  and branch protection (deliberately) lets nothing merge without them. When
  that person is busy, everything waits; when they come back, everything
  merges at once, and merging all at once caused risks 8 and 17.
- **What happened:** Sprint 4 (risk 2). One approved pull request (#96) had to be
  re-approved after rebasing to catch up, because the ruleset dismisses an
  approval on new commits.
- **Mitigation:** review within one working day, and a pull request waiting
  longer gets a direct message, not only a notification. Merge as soon as it
  is approved rather than batching (`BACKLOG.md`, working rules for Sprints 5
  and 6).
- **Status:** **Occurred.** The new rules are in place for Milestone 3; whether
  they work goes in the retrospective (#123).

### 17. A release or merge lands on the wrong commit or branch

- **What happened, twice:**
  - #108 targeted another pull request's branch and was merged after that pull
    request had already merged, so its changes reached that branch and never
    `main`. They were re-applied as #113.
  - `milestone-2` and `v0.3.0` were tagged on `bf38f4e`, one commit before #115
    cut the `[0.3.0]` changelog section, so the changelog at the tag still says
    "Unreleased". The release notes on GitHub are correct.
- **Mitigation:** retarget a stacked pull request to `main` before merging it,
  and tag a release on the merge commit of its own changelog pull request
  (`BACKLOG.md`, working rules; #125). The tags were left as submitted.
- **Status:** **Occurred** twice; the rules are in place.

### 18. The test toolchain can't be upgraded on one machine

- **Cause:** Vite 8 and Vitest 4 depend on Rolldown, whose native binding is
  blocked by Windows Application Control on a team member's machine. The
  project pins Vite 6 and Vitest 2 (`docs/security/dependency-audit.md`).
- **Consequence:** seven development-only advisories through Vitest 2 stay
  open. None ships with the application.
- **Status:** **Accepted** for the course. #101 records whether Vitest 4.1.11 or
  later can run on both machines.

### 19. AI-generated changes merged without being understood

- **Cause:** much of the project was built with an AI coding agent (Claude
  Code), as pull requests disclose. The risk is code that passes review because
  it looks right, not because the reviewer understood it.
- **Mitigation:** the same gates as any change: one approving review by the
  other member, the three CI checks, and the tests, which in several places
  were written to fail without the fix (#111, #90). For the recorded feature,
  [the AI-assisted workflow log](./ai-assisted-workflow.md) shows each request
  and what was accepted, edited or rejected, including where a test caught the
  AI's mistake.
- **Status:** **Mitigated**, as far as review can show: every AI-written change
  went through the same approval and checks as any other, and the defects in
  risk 10 were caught by that process before release.

### 20. A production secret leaks

- **Cause:** deployment adds secrets: `SESSION_SECRET`, `DATABASE_URL`, and the
  Render deploy hook CD will call.
- **Mitigation:** secrets live only in Render's and GitHub's secret settings,
  never in the repository or a pull request (`BACKLOG.md`, working rules).
  `.env` is ignored by Git. The server refuses to start in production with the
  example secret. Rotating a secret is in the
  [maintenance plan](./maintenance-plan.md).
- **Status:** **Open** until #117 and #118, when the secrets first exist.

### 21. Rate limits reset or split when the server restarts or scales

- **Cause:** the login and registration counters are kept in memory in one
  process (`docs/security/rate-limiting.md`). A restart clears them, and two
  instances would count separately.
- **Status:** **Accepted.** On one free-tier instance it means an attacker gets
  a fresh allowance after each restart, which restarts don't give them control
  of. A shared store (for example the PostgreSQL the app already uses) is the
  fix if the app ever runs more than one instance.

### 22. Security events go unnoticed

- **Cause:** the server logs only unexpected errors. Nothing records a failed
  login, a rate limit reached, or a refused request (OWASP review, A09).
- **Status:** **Open:** #99, Sprint 6, once there is a host to collect logs.
