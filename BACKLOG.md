# RoomSync product backlog

This backlog lists all user stories identified in the Milestone 0 proposal,
ordered by priority. **P0** stories are required for the Milestone 1 MVP.
**P1** stories are planned but deferred until P0 work is complete. Each story
is tracked as a GitHub Issue, labeled by priority and area, and assigned to an
owner.

Ownership and sprint assignment are revisited at each sprint boundary as
described in the proposal. Status values are **Not started**, **In progress**,
**In review**, and **Done**; a story reaches Done only when it meets the
Definition of Done at the bottom of this file.

Sprint 1 closed on September 16, 2026. This file was last updated on
September 22, 2026.

## P0 — Required for Milestone 1 MVP

| # | Story | Area | Owner | Sprint | Status |
|---|---|---|---|---|---|
| US-01 | As a new user, I want to create a RoomSync account so that I can access the application. | Account | Orlando | Sprint 2 | In review |
| US-02 | As a registered user, I want to log into RoomSync so that I can access my household information. | Account | Orlando | Sprint 2 | Not started |
| US-03 | As a user, I want to create a household so that I can manage responsibilities with my roommates. | Household | Agustin | Sprint 2 | Not started |
| US-04 | As a household owner, I want to invite another user so that they can join my household. | Household | Agustin | Sprint 2 | Not started |
| US-05 | As a household member, I want to record a shared expense so that the household can track who owes money. | Expense | Agustin | Sprint 2 | Not started |
| US-06 | As a household member, I want to split an expense so that each roommate's financial responsibility is calculated correctly. | Expense | Agustin | Sprint 2 | Not started |
| US-07 | As a user, I want to see what I owe and what others owe me so that I understand my household balance. | Expense | Orlando | Sprint 2 | Not started |
| US-08 | As a household member, I want to record that a debt has been paid so that balances reflect money that has already changed hands. | Expense | Orlando | Sprint 2 | Not started |
| US-09 | As a household member, I want to create and assign chores so that household responsibilities are distributed among roommates. | Chore | Agustin | Sprint 2 | Not started |
| US-10 | As a household member, I want to view a household dashboard so that I can quickly understand my responsibilities. | Dashboard | Orlando | Sprint 2 | Not started |

## P1 — Planned for MVP, deferred until P0 is complete

| # | Story | Area | Owner | Sprint | Status |
|---|---|---|---|---|---|
| US-11 | As a household member, I want to view past expenses, settlements, and chores so that I can check what a charge was for, confirm a debt was paid, or confirm a task was completed. | History | Orlando | Sprint 3 | Not started |

## Sprint 1 outcome

US-01, US-02, and US-03 were planned for Sprint 1 and none of them started
within it. Sprint 1 went to the foundation those stories depend on: client and
server workspaces, the database schema and initial migration, the layered server
structure, and the API contract. All three moved to Sprint 2, which now carries
the entire P0 set. US-01 has since been implemented and is in review.

That is the main schedule risk going into Milestone 1 on September 30. The
milestone requires a working end-to-end MVP and explicitly rules out a static
mock-up, so if the sprint tightens, the P1 history story (US-11) and the softer
design documentation move to Milestone 2 before any P0 feature does.

## Supporting work not tracked as user stories

The GitHub board carries more issues than this file has stories, because the
proposal's Section 9 milestone deliverables and the project's infrastructure are
tracked as issues too. They are not user-facing stories, so they are not in the
tables above. By category:

- **Infrastructure:** workspace scaffold, database schema and migration,
  layered server structure, API contract, containerization, CI pipeline
- **Design and documentation:** software process model, ADR-001, use cases,
  analysis model, design classes and module boundaries, component designs, UX
  wireframes, responsive design considerations, design patterns, updated product
  brief
- **Quality and security:** test plan, coverage reporting, QA checklist, threat
  model, OWASP review, dependency audit

This file remains the authority for scope and priority of user-facing
functionality. The board is the authority for all work in progress.

## Backlog by area

Grouping the same stories by feature area, for quick reference when planning
a sprint around a single part of the system:

- **Account management:** US-01, US-02
- **Household management:** US-03, US-04
- **Expense management:** US-05, US-06, US-07, US-08
- **Chore management:** US-09
- **Dashboard:** US-10
- **History:** US-11

## Future features (not in backlog yet)

Identified in the proposal as potential post-MVP work, to be turned into
backlog items if time permits after Milestone 2: recurring expenses,
recurring chores, email/push notifications, expense categories, expense
editing and deletion, member removal, support for multiple households per
user, calendar integration, advanced household analytics, and a native
mobile application.

## Explicitly out of scope

Not planned for this project at any milestone: actual payment processing,
integration with Venmo/Cash App/Zelle/banking services, native mobile
applications (beyond the future-features list above), real-time household
chat, automatic bank transaction importing, AI-based recommendations, and
automatic bill retrieval from utility providers.

## Definition of Done

A story is not moved to Done until:

- The implementation meets its acceptance criteria (see the proposal's
  Initial Requirements section).
- The implementation follows project coding standards.
- The implementation follows the Routes -> Services -> Repositories layering
  defined in ADR-001.
- Relevant unit or integration tests are written and passing.
- Continuous integration checks pass (from Milestone 2 onward).
- The change has been reviewed and approved by the other team member.
- The change integrates without breaking existing functionality.
- No known critical defects remain.
- Related documentation, including the README, is updated.
