# RoomSync product backlog

This backlog lists the user stories for RoomSync, ordered by priority. Each story
is tracked as a GitHub Issue, labeled by priority and area, and assigned to an
owner.

**P0** means graded at the current milestone: the milestone is not complete
without it. **P1** means planned, but it can slip to the next milestone without
failing this one. Until Milestone 1 the labels meant "required for the MVP" and
"deferred until the MVP is complete"; they were redefined for Milestone 2, when
the MVP was already done and the question became what Milestone 2 is graded on.

Ownership and sprint assignment are revisited at each sprint boundary as
described in the proposal. Status values are **Not started**, **In progress**,
**In review**, and **Done**; a story reaches Done only when it meets the
Definition of Done at the bottom of this file.

Sprint 1 closed on September 16, 2026, and Sprint 2 on September 30, 2026,
with Milestone 1. Sprint 3 runs to October 14 and Sprint 4 to November 2, with
Milestone 2. This file was last updated on October 5, 2026.

## Milestone 1 — MVP (done)

| # | Story | Area | Owner | Sprint | Status |
|---|---|---|---|---|---|
| US-01 | As a new user, I want to create a RoomSync account so that I can access the application. | Account | Orlando | Sprint 2 | Done |
| US-02 | As a registered user, I want to log into RoomSync so that I can access my household information. | Account | Orlando | Sprint 2 | Done |
| US-03 | As a user, I want to create a household so that I can manage responsibilities with my roommates. | Household | Agustin | Sprint 2 | Done |
| US-04 | As a household owner, I want to invite another user so that they can join my household. | Household | Agustin | Sprint 2 | Done |
| US-05 | As a household member, I want to record a shared expense so that the household can track who owes money. | Expense | Agustin | Sprint 2 | Done |
| US-06 | As a household member, I want to split an expense so that each roommate's financial responsibility is calculated correctly. | Expense | Agustin | Sprint 2 | Done |
| US-07 | As a user, I want to see what I owe and what others owe me so that I understand my household balance. | Expense | Agustin | Sprint 2 | Done |
| US-08 | As a household member, I want to record that a debt has been paid so that balances reflect money that has already changed hands. | Expense | Agustin | Sprint 2 | Done |
| US-09 | As a household member, I want to create and assign chores so that household responsibilities are distributed among roommates. | Chore | Agustin | Sprint 2 | Done |
| US-10 | As a household member, I want to view a household dashboard so that I can quickly understand my responsibilities. | Dashboard | Agustin | Sprint 2 | Done |

## Milestone 2 — additional features

Milestone 2 must contain "a working application with additional completed
features." The proposal's Milestone 2 plan names the history views and, from the
future-features list, expense editing and deletion and member removal. US-11
was P1 in Milestone 1 and is P0 here.

| # | Story | Area | Priority | Owner | Sprint | Issue | Status |
|---|---|---|---|---|---|---|---|
| US-11 | As a household member, I want to view past expenses, settlements, and chores so that I can check what a charge was for, confirm a debt was paid, or confirm a task was completed. | History | P0 | Orlando | Sprint 3 | #23 | Not started |
| US-12 | As a household member, I want to correct or delete an expense that was entered wrong, so that balances reflect what was actually spent. | Expense | P0 | Orlando | Sprint 4 | #60 | Not started |
| US-14 | As a household owner, I want to revoke an invitation link I no longer want used, so that a link shared by mistake can't add someone to my household. | Household | P0 | Agustin | Sprint 4 | #75 | Not started |
| US-13 | As a household owner, I want to remove a roommate who has moved out, and as a member, I want to leave a household, so that the member list reflects who actually lives there. | Household | P1 | Agustin | Sprint 4 | #74 | Not started |

## Sprint 1 outcome

US-01, US-02, and US-03 were planned for Sprint 1 and none of them started
within it. Sprint 1 went to the foundation those stories depend on: client and
server workspaces, the database schema and initial migration, the layered server
structure, and the API contract. All three moved to Sprint 2, which then carried
the entire P0 set.

## Sprint 2 outcome

All ten P0 stories, US-01 through US-10, are Done and merged, so Milestone 1
ships the full MVP the proposal described rather than a reduced one. The
design documentation landed in the same sprint, and US-11 stays P1 in
Sprint 3 as planned.

Ownership moved during the sprint so neither member waited on the other: the
balances and settlements stories (US-07, US-08) and the dashboard (US-10) were
built by Agustin, and the Owner column above records who built each story.
What is still open going into Milestone 2 is recorded in the product brief
(`docs/product-brief.md`, Section 5).

## Sprint 3 and Sprint 4 plan (Milestone 2)

Milestone 2 is due November 2 at 11:59 PM. Besides the stories above, it is
graded on testing, security, and process evidence, each tracked as an issue.
Work is split evenly. Counting the stories above, Orlando has seven P0
issues and one P1, and Agustin has six P0 issues and five smaller P1 issues;
the submission is shared.

| Issue | Work | Owner | Priority | Sprint | Target |
|---|---|---|---|---|---|
| #61 | Integration tests against PostgreSQL | Orlando | P0 | Sprint 3 | Oct 9 for the test-database setup, Oct 14 for every flow |
| #62 | Coverage report and justified target | Orlando | P0 | Sprint 3 | Oct 14 |
| #63 | QA plan and PR checklist | Orlando | P0 | Sprint 3 | Oct 14 |
| #64 | Protect `main`: required review, then CI checks | Orlando | P1 | Sprint 3 | Oct 6 |
| #65 | OWASP Top 10 review and dependency audit | Orlando | P0 | Sprint 4 | Oct 28 |
| #67 | README and verification guide for Milestone 2 | Orlando | P0 | Sprint 4 | Oct 31 |
| #66 | Cross-viewport and real-device testing | Agustin | P0 | Sprint 4 | Oct 31 |
| #70 | Threat model | Agustin | P0 | Sprint 3 | Oct 14 |
| #71 | Rate limiting on login and registration (the security control) | Agustin | P0 | Sprint 3 | Oct 14 |
| #72 | `CONTRIBUTING.md`: branching, commit, and review conventions | Agustin | P0 | Sprint 3 | Oct 14 |
| #77 | `CHANGELOG.md` and releases v0.1.0, v0.2.0, v0.3.0 | Agustin | P0 | Sprints 3–4 | v0.1.0 now, v0.2.0 Oct 14, v0.3.0 Nov 1 |
| #68 | GitHub Actions CI | Agustin | P1 | Sprint 3 | Oct 9 |
| #69 | Server ESLint with the Prisma import rule | Agustin | P1 | Sprint 3 | Oct 9 |
| #73 | Make one-household-per-user atomic | Agustin | P1 | Sprint 4 | Oct 21 |
| #76 | Client component tests | Agustin | P1 | Sprint 4 | Oct 28 |
| #78 | Milestone 2 submission and `milestone-2` tag | Both | P0 | Sprint 4 | Nov 1 |

CI and branch protection are P1 because the course grades them at Milestone 3,
not Milestone 2. They are still scheduled first, because every later pull
request benefits from them.

### Where one member waits on the other

Most of this work can run in parallel. These are the only places where one
member's issue waits on the other's, and what each side does so the wait never
happens:

| Waiting | Waits on | What actually waits | So that nobody is blocked |
|---|---|---|---|
| #73 (Agustin) | #61 (Orlando) | Only the concurrent-request test, which needs the test database | #61 ships the test-database setup with one flow as its own PR by Oct 9 |
| #64 (Orlando) | #68 (Agustin) | Only the required status checks | The approval rule goes on now; checks are added the day CI merges |
| #65 (Orlando) | #70 (Agustin) | The OWASP review cross-references the threat model | #70 lands in Sprint 3; #65 is Sprint 4 |
| #66 (Agustin) | #23, #60 (Orlando) | Testing the new screens | Feature freeze Oct 28; the existing screens can be tested any time |
| #67 (Orlando) | #71, #75 (Agustin) | Documenting the rate limit and the new screens | Feature freeze Oct 28 |

Each issue on the board has a **Dependencies and target** section saying when
it can start, what it waits on, and what it unblocks, and GitHub's "blocked by"
links mark the issues that cannot close until another one does.

### Working rules for Sprints 3 and 4

- **Blocked for more than a day:** say so on the issue and pick up something
  else in your own column rather than waiting.
- **Feature freeze on October 28.** After it, only fixes, tests, and
  documentation merge, so the last days go to testing, the README, and the
  submission.
- **Migrations:** only US-12 (#60) is expected to need one. Anyone who needs
  another tells the other member before generating it, so two migrations
  don't collide.
- **Shared files** (`server/src/services/errors.ts`, `client/src/lib/api.ts`,
  the API contract, this file, and the use cases) will conflict; the
  resolution is almost always to keep both sides.
- **P1 work not done by October 31** moves to Milestone 3 rather than holding
  up the submission.

## Supporting work not tracked as user stories

The GitHub board carries more issues than this file has stories, because the
proposal's Section 9 milestone deliverables and the project's infrastructure are
tracked as issues too. They are not user-facing stories, so they are not in the
story tables above. By category:

- **Infrastructure:** workspace scaffold, database schema and migration,
  layered server structure, API contract, CI pipeline, server linting, branch
  protection, containerization
- **Design and documentation:** software process model, ADR-001, use cases,
  analysis model, design classes and module boundaries, component designs, UX
  wireframes, responsive design considerations, design patterns, updated product
  brief, contribution conventions, changelog
- **Quality and security:** test plan and QA checklist, coverage reporting,
  integration and component tests, cross-viewport testing, threat model, OWASP
  review, dependency audit, rate limiting

This file remains the authority for scope and priority of user-facing
functionality. The board is the authority for all work in progress.

## Backlog by area

Grouping the same stories by feature area, for quick reference when planning
a sprint around a single part of the system:

- **Account management:** US-01, US-02
- **Household management:** US-03, US-04, US-13, US-14
- **Expense management:** US-05, US-06, US-07, US-08, US-12
- **Chore management:** US-09
- **Dashboard:** US-10
- **History:** US-11

## Future features (not in backlog yet)

Identified in the proposal as potential post-MVP work, to be turned into
backlog items if time permits: recurring expenses, recurring chores,
email/push notifications, expense categories, support for multiple households
per user, calendar integration, advanced household analytics, and a native
mobile application. Expense editing and deletion and member removal moved into
the backlog as US-12 and US-13 for Milestone 2.

## Explicitly out of scope

Not planned for this project at any milestone: actual payment processing,
integration with Venmo/Cash App/Zelle/banking services, native mobile
applications (beyond the future-features list above), real-time household
chat, automatic bank transaction importing, AI-based recommendations, and
automatic bill retrieval from utility providers.

## Definition of Done

A story is not moved to Done until:

- The implementation meets its acceptance criteria, and each criterion's box
  on the issue is ticked as it lands.
- The implementation follows project coding standards.
- The implementation follows the Routes -> Services -> Repositories layering
  defined in ADR-001.
- Relevant unit or integration tests are written and passing.
- Continuous integration checks pass, once CI is in place (#68).
- The other team member has clicked **Approve** on the pull request before it
  merges, and the pull request was not merged by its author.
- The pull request body says `Closes #N`, so the issue links to the change that
  closed it.
- The change integrates without breaking existing functionality.
- No known critical defects remain.
- Related documentation, including the README, is updated.
