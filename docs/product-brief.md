# Product Brief and MVP Scope — Milestone 1

RoomSync — Software Design and Development
Issue #26 · Milestone 1 deliverable

Updates the Milestone 0 executive summary with what two sprints of building
taught us. Neither the product thesis nor the MVP scope changed. The plan did:
the first sprint went to foundation instead of features, and the second
delivered every P0 story. This records both, including what is still missing.

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

Every P0 story, US-01 through US-10, is built, merged, and working end to end:

| Capability | Story | PRs |
|---|---|---|
| Account registration | US-01 | #34, #38 |
| Login, logout, session that survives a refresh and a restart | US-02 | #37, #38 |
| Household creation, membership guard, members list | US-03 | #39, #40, #43, #48 |
| Roommate invitations: create a link, preview, join | US-04 | #51 |
| Record a shared expense, with a server-calculated preview | US-05 | #47, #50, #52 |
| Split equally, by amount, or by percentage, exact to the cent | US-06 | #47, #50 |
| Balances with each roommate, derived on every read | US-07 | #54 |
| Record a settlement, checked against the balance at the moment of writing | US-08 | #54 |
| Create, assign, edit and complete chores, with overdue marked | US-09 | #53 |
| Household dashboard: members, balances, my chores, recent activity | US-10 | #58 |
| Seed data: four demo accounts, every split method, settlements, chores | — | #52, #58 |

A new user can register, create a household, invite a roommate who joins
through the link, record an expense and split it any of three ways, see who
owes whom, record that a debt was paid, and share chores — and see all of it
on one dashboard. Every screen talks to the real API and PostgreSQL; nothing is
stubbed. The README's verification guide walks a reviewer through exactly that
flow against the seed data.

Underneath it: the eight-entity schema, PostgreSQL-backed sessions, one error
contract every endpoint shares, all 23 endpoints in the API contract, and a
layered architecture whose dependency rules are written as checks that pass on
`main`.

**408 server tests and 91 client tests**, all passing. The server suite covers
every service and route with the repositories mocked; the client suite covers
the pure logic in `client/src/lib/` — money parsing and the wording of
balances, due dates and activity.

---

## 3. What is not built

| Capability | Story | State |
|---|---|---|
| History of expenses, settlements and completed chores | US-11 | P1, scheduled for Sprint 3 |
| Expense detail screen | US-05, US-11 | Designed in the wireframes; the endpoint exists, the screen arrives with US-11 |

Outside the MVP, as the proposal set out and the analysis model records:
editing or deleting an expense, removing a member, revoking an invitation,
recurring expenses and chores, and anything that moves real money.

### How the plan changed

Sprint 1 was planned around US-01 through US-03 and delivered none of them
within the sprint. The time went to foundation the stories depend on: workspace
scaffolding, the database schema and migration, the layered server structure,
ADR-001, and the API contract. That work was necessary — US-02 took roughly a
sixth of the time US-01 did, because the patterns were already established —
but it was not planned, which means the plan was wrong rather than the work
being slow.

Sprint 2 therefore began carrying the entire P0 set, and delivered it. The
foundation is what made that possible: once one feature had gone through
contract, repository, service, route and screen, the next nine followed the
same shape. Several stories changed hands during the sprint to keep both
members unblocked; the backlog's Owner column records who built each.

---

## 4. MVP scope

The Milestone 0 MVP is the delivered MVP. Nothing was cut.

Under time pressure the work was ordered in three tiers, and all of the first
two landed:

**Tier 1 — the demonstrable slice.** Register, log in, create a household,
record an expense, split it, see the balance. US-01, 02, 03, 05, 06, 07.
**Delivered.**

**Tier 2 — completes the MVP.** Invitations (US-04), settlements (US-08),
chores (US-09), the full dashboard (US-10). **Delivered.**

**Tier 3 — P1.** History (US-11), scheduled for Sprint 3.

---

## 5. Known gaps carried into Milestone 2

Recorded here so they are deliberate rather than discovered:

**No continuous integration.** Per the proposal, CI runs from Milestone 2 and
blocks merges from Milestone 3. Until then the tests, the layering checks in
`docs/design/module-structure.md`, and the Definition of Done are run by hand.

**Client tests cover logic, not components.** The client suite tests
`client/src/lib/`; there are no component tests and no coverage report yet.
Both belong to the Milestone 2 test plan.

**NFR-02 is not load-tested.** The dashboard answers in about 60 ms against the
seed data, and each activity source is capped before merging, but nobody has
measured it against the 500 expenses NFR-02 names.

**One accepted security limitation.** Registration returns 409 when an email is
already taken, which reveals that the account exists even though the message
does not. Closing it properly requires email verification, which the MVP does
not have. Recorded for the Milestone 2 threat model.

**One known race.** The one-household-per-user check and the write that adds
the membership are not one atomic step, in both household creation and
accepting an invitation. A double-clicked button or two invitations accepted at
the same instant could leave one user in two households. Raised in review on
#39 and accepted as non-blocking; the fix is a database constraint or a lock
around the check.

**Untested on real devices.** Every screen is verified at 375px and 1280px in a
headless browser, with screenshots committed, but has not run on a physical
phone, in landscape, or with text scaled to 200%.

**Review was skipped twice.** #41 and #52 were merged by their author without
the other member's review. Both were missing acceptance criteria, which were
found afterwards and completed in #58. Every other pull request was approved or
merged by the other member. The Milestone 2 fix is branch protection on `main`
requiring one approval, so the Definition of Done's review step is enforced
rather than remembered.

---

## 6. What Milestone 1 demonstrates

- **A working end-to-end system, not a mock-up.** Every screen talks to a real
  API backed by real PostgreSQL, and a fresh clone runs from the README alone.
- **Money is exact.** All amounts are integer cents and percentages integer
  basis points. Splits pass through one function whose shares must sum exactly
  to the total, with 41 tests on the rounding rules, and settlements are
  checked under a per-household lock so two payments cannot together exceed a
  debt.
- **The architecture holds.** Routes, services and repositories stay in their
  lanes, and the rules are grep commands in `module-structure.md` that return
  nothing on `main`.
- **The security decisions are real ones.** Session regeneration against
  fixation, timing-equalized login, bcrypt with per-user salts, and server-side
  authorization on every household request — a household you do not belong to
  answers 404, exactly like one that does not exist.
- **Review caught real defects.** Review found a concurrent-registration race in
  one feature and the same class of race in household creation in another, and
  the gaps in two unreviewed merges were found and closed before submission.

---

## 7. Success criteria status

| | Criterion | State |
|---|---|---|
| SC-01 | Account access | Met |
| SC-02 | Household management | Met — create, invite, join, list members |
| SC-03 | Expense management | Met |
| SC-04 | Accurate expense splitting | Met — shares always sum exactly to the total; 41 tests |
| SC-05 | Balance tracking | Met — derived on every read, never stored |
| SC-06 | Settlement recording | Met |
| SC-07 | Chore management | Met |
| SC-08 | Dashboard | Met |
| SC-09 | Security | Met — every household endpoint behind the membership guard |
| SC-10 | Testing | Partly — 408 server and 91 client tests; CI and a coverage report are Milestone 2 |
