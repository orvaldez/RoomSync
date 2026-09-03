# RoomSync product backlog

This backlog lists all user stories identified in the Milestone 0 proposal,
ordered by priority. **P0** stories are required for the Milestone 1 MVP.
**P1** stories are planned but deferred until P0 work is complete. Stories
will be entered as individual GitHub Issues, labeled by priority and area,
and assigned to an owner at the start of each sprint.

Each story below includes its planned owner (per the proposal's team
responsibilities) and a suggested sprint. Ownership and sprint assignment
will be revisited at each sprint boundary as described in the proposal.

## P0 — Required for Milestone 1 MVP

| # | Story | Area | Owner | Sprint |
|---|---|---|---|---|
| US-01 | As a new user, I want to create a RoomSync account so that I can access the application. | Account | Orlando | Sprint 1 |
| US-02 | As a registered user, I want to log into RoomSync so that I can access my household information. | Account | Orlando | Sprint 1 |
| US-03 | As a user, I want to create a household so that I can manage responsibilities with my roommates. | Household | Agustin | Sprint 1 |
| US-04 | As a household owner, I want to invite another user so that they can join my household. | Household | Agustin | Sprint 2 |
| US-05 | As a household member, I want to record a shared expense so that the household can track who owes money. | Expense | Agustin | Sprint 2 |
| US-06 | As a household member, I want to split an expense so that each roommate's financial responsibility is calculated correctly. | Expense | Agustin | Sprint 2 |
| US-07 | As a user, I want to see what I owe and what others owe me so that I understand my household balance. | Expense | Orlando | Sprint 2 |
| US-08 | As a household member, I want to record that a debt has been paid so that balances reflect money that has already changed hands. | Expense | Orlando | Sprint 2 |
| US-09 | As a household member, I want to create and assign chores so that household responsibilities are distributed among roommates. | Chore | Agustin | Sprint 2 |
| US-10 | As a household member, I want to view a household dashboard so that I can quickly understand my responsibilities. | Dashboard | Orlando | Sprint 2 |

## P1 — Planned for MVP, deferred until P0 is complete

| # | Story | Area | Owner | Sprint |
|---|---|---|---|---|
| US-11 | As a household member, I want to view past expenses, settlements, and chores so that I can check what a charge was for, confirm a debt was paid, or confirm a task was completed. | History | Orlando | Sprint 3 |

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
- Relevant unit or integration tests are written and passing.
- Continuous integration checks pass (from Milestone 2 onward).
- The change has been reviewed and approved by the other team member.
- The change integrates without breaking existing functionality.
- No known critical defects remain.
- Related documentation, including the README, is updated.
