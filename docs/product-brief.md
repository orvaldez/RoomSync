# Product Brief and MVP Scope — Milestone 1

RoomSync — Software Design and Development
Issue #26 · Milestone 1 deliverable

Updates the Milestone 0 executive summary with what a sprint of building
taught us. The product thesis has not changed. The scope has, and this records
the change deliberately rather than letting the gap between the proposal and
the repository go unstated.

Status as of September 30, 2026.

---

## 1. The product

RoomSync is a web application for roommates to coordinate shared expenses and
chores in one place.

Students manage household money through group texts, spreadsheets and payment
apps, which makes it hard to answer the two questions that actually matter: who
owes what, and what am I supposed to do. Existing expense splitters are built
around **trips** — temporary groups where each expense is an isolated debt that
gets settled and closed.

RoomSync is built around the **standing household**. A household persists for
the length of a lease, balances carry forward month to month instead of
resetting, and chores live in the same space as expenses. That is the product
thesis, and nothing in Milestone 1 has challenged it.

It is worth being precise about what that means technically, because it shaped
the architecture: since balances never reset, they are derived from the
underlying records at read time rather than stored as running totals (NFR-03).
A stored total is a second source of truth that drifts the first time a write
fails halfway, and over a twelve-month lease that drift compounds silently.

**RoomSync does not move money.** It records that a payment happened elsewhere.
That keeps payment processing, financial account data, and the compliance
obligations attached to both outside the project entirely — a scope decision
from Milestone 0 that has held up well.

---

## 2. What is built

Working end to end, merged or in review, as of this milestone:

| Capability | Story | State | PR |
|---|---|---|---|
| Account registration | US-01 | Merged | #34 |
| Login, logout, session | US-02 | Merged | #37 |
| Household creation | US-03 | Merged | #39 |
| Membership guard and members endpoint | — | Merged | #40 |
| Registration and login screens | — | Merged | #38 |
| Create-household screen, dashboard, members panel | — | Merged | #43 |

A user can register, log in, stay logged in across a page refresh and a server
restart, create a household, see it, and see who else belongs to it. That is a
complete vertical slice — React through Express, service, repository, to
PostgreSQL — with server-side authorization on every request.

The members panel is worth singling out because it is the first screen showing
real household data rather than a labelled empty state, and it goes through
`requireHouseholdMember`: a household you do not belong to answers exactly like
one that does not exist (404, never 403), so the API cannot be used to discover
other households.

Underneath it: the full eight-entity schema with a clean initial migration,
PostgreSQL-backed sessions, an error contract every endpoint shares, and a
layered architecture with the dependency rules written as checks that pass
today.

**135 server tests.** No client tests yet; see §5.

---

## 3. What is not built

Stated plainly because the proposal's MVP list and the repository do not match,
and the difference is the most useful thing this document can record.

| Capability | Story | State |
|---|---|---|
| Roommate invitations | US-04 | Not started |
| Record a shared expense | US-05 | In review — PR #47 |
| Split an expense (equal, custom, percentage) | US-06 | In review — PR #47 |
| View balances | US-07 | Not started — needs US-05/06 |
| Record a settlement | US-08 | Not started |
| Create and assign chores | US-09 | Not started |
| Full dashboard content | US-10 | Members panel live; other panels empty |
| History | US-11 | P1, deferred to Sprint 3 |

The dashboard's members panel shows real data. Its balance, chores and activity
panels are labelled empty states rather than real content, because the
endpoints behind them do not exist yet.

### Why

Sprint 1 was planned around US-01 through US-03 and delivered none of them
within the sprint. The time went to foundation the stories depend on: workspace
scaffolding, the database schema and migration, the layered server structure,
ADR-001, and the API contract. That work was necessary and is not wasted — US-02
took roughly a sixth of the time US-01 did, because the patterns were already
established — but it was not planned, which means the plan was wrong rather
than the work being slow.

Sprint 2 therefore began carrying the entire P0 set with one sprint's capacity,
and that gap has not closed.

---

## 4. MVP scope, revised

The Milestone 0 MVP remains the target. What changes is the order and the
honest expectation of what lands when.

**Tier 1 — the demonstrable slice.** Register, log in, create a household,
record an expense, split it, see the balance. US-01, 02, 03, 05, 06, 07.

Chosen because it exercises every layer and the hardest logic in the system
(exact-cent splitting, SC-04), and because a narrow path that genuinely works
demonstrates the architecture. Six half-finished features demonstrate nothing.

**Tier 2 — completes the MVP.** Invitations (US-04), settlements (US-08),
chores (US-09), the full dashboard (US-10).

**Tier 3 — P1.** History (US-11), already scheduled for Sprint 3.

Nothing has been cut from the MVP. The tiers are a statement of order under
time pressure, not a reduction in scope.

---

## 5. Known gaps carried into Milestone 2

Recorded here so they are deliberate rather than discovered:

**No client tests.** Vitest is not configured on the frontend. The server has
135 tests; the client has none. This was a conscious trade — configuring React
Testing Library costs time that went into features — and it belongs in
Milestone 2, where the test plan and coverage report are deliverables.

**No continuous integration.** Per the proposal, CI runs from Milestone 2 and
blocks merges from Milestone 3. Until then the layering rules, the Definition
of Done, and the no-self-merge rule are enforced by review.

**One accepted security limitation.** Registration returns 409 when an email is
already taken, which reveals that the account exists even though the message
does not. Closing it properly requires email verification, which the MVP does
not have. Recorded for the Milestone 2 threat model.

**One known race.** `hasMembership` and household creation are not atomic, so
two concurrent creates from one user — a double-clicked button — could produce
two households with no database constraint to catch it. Raised in review on
#39, accepted as non-blocking, and due when US-04 forces the membership model
to be revisited.

**Untested on real devices.** The interface is verified at 375px in a headless
browser but has not run on a physical phone. Cross-viewport evidence is a
Milestone 2 deliverable.

---

## 6. What Milestone 1 demonstrates

Against the milestone's own criteria:

- **A working end-to-end system, not a mock-up.** Every screen talks to a real
  API backed by real PostgreSQL. Nothing is stubbed.
- **The architecture holds.** The dependency rules are written as grep commands
  that pass against `main` today, not aspirations. They live in the design
  classes document, which is in review as PR #44.
- **The security decisions are real ones.** Session regeneration against
  fixation, timing-equalized login, bcrypt with per-user salts, server-side
  authorization on every request including direct API calls.
- **The process produced correct code.** Every merged PR was reviewed by the
  other member, and review caught real defects in both directions — a
  concurrent-registration race in one, the same class of race in household
  creation in the other.

What it does not demonstrate is the full feature set. That is the honest
summary: the foundation is solid and the architecture is sound, and there is
less of the MVP built on top of it than the Milestone 0 plan projected.

---

## 7. Success criteria status

| | Criterion | State |
|---|---|---|
| SC-01 | Account access | Met |
| SC-02 | Household management | Partly — creation and member listing work, joining does not exist |
| SC-03 | Expense management | Not met — in review, PR #47 |
| SC-04 | Accurate expense splitting | Not met |
| SC-05 | Balance tracking | Not met |
| SC-06 | Settlement recording | Not met |
| SC-07 | Chore management | Not met |
| SC-08 | Dashboard | Partly — members panel live, other panels labelled empty states |
| SC-09 | Security | Met for what exists; extends with each endpoint |
| SC-10 | Testing | Partly — 135 server tests, no client tests, no coverage report |
| SC-11 | Independent execution | Met — clone, `docker compose up`, `npm install`, `migrate dev`, run |
| SC-12 | Deployment | Milestone 3 |
| SC-13 | Maintainability | Met — documented architecture, layering rules, ADR |