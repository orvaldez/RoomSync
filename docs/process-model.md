# Software Process Model and Justification

RoomSync — CS 415: Software Design and Development
Orlando Rodriguez Valdez, Agustin Lemuz-Juarez
Issue #25 · Milestone 1 deliverable

---

## 1. The model we chose

RoomSync is developed using an **iterative and incremental Agile process**, organized
as two-week sprints and drawing its practices from Scrum, adapted for a two-person
team. Each sprint produces a working increment of the application. Each of the four
course milestones falls at the end of a sprint, so a milestone is never a separate
phase of work — it is the increment a sprint already produced, plus its documentation.

Concretely, the process consists of:

- **Two-week sprints**, approximately six across the semester, with milestone
  boundaries aligned to sprint boundaries
- **A single prioritized product backlog** of user stories, held in `BACKLOG.md` and
  tracked as GitHub Issues labeled by priority (P0/P1) and feature area
- **Sprint planning** at the start of each sprint, selecting from the top of the
  backlog and assigning ownership
- **A weekly check-in** to surface blockers and confirm what each member is working on
- **A retrospective** at the end of each sprint
- **A shared Definition of Done** that every story must satisfy before it closes
- **Trunk-based development with mandatory peer review**: a protected `main`, all work
  on short-lived branches, no pull request merged by its own author

## 2. Why this model fits RoomSync

### The requirements are stable, but our understanding of them is not

RoomSync's scope was fixed at Milestone 0: eleven user stories, seventeen functional
requirements, a defined MVP, and an explicit out-of-scope list. That stability might
appear to argue for a plan-driven process. It does not, because the requirements being
stable is not the same as the *design* being understood.

Sprint 1 demonstrated this directly. The proposal's entity relationship diagram
(Figure 3) was reviewed and approved before any code existed, and it was still
incomplete in three places that only became visible while writing the actual schema:

- US-05's acceptance criteria require a user-entered expense date, which is a different
  fact from the creation timestamp the diagram specified
- US-10 and US-11 both need a chore completion *time*, which a boolean
  `is_complete` flag cannot supply
- Storing split percentages as a decimal introduces exactly the rounding error that
  SC-04 forbids, which pushed us to integer basis points instead

None of these are requirements changes. All three are design gaps that surfaced only
on contact with implementation. A process that froze the design before construction
would have carried all three into the build phase and discovered them during testing,
when they are schema migrations rather than schema edits.

### The milestone structure is already iterative

The course requires a runnable version of the application at every milestone from
Milestone 1 onward, and explicitly rules out a static mock-up. That is a requirement
for working increments, which is the defining property of an incremental process. A
process model that deferred integration to the end could not satisfy the grading
criteria regardless of its other merits.

### Two people cannot afford serialized phases

With a two-person team, any process that separates design, implementation, and testing
into distinct phases leaves one member idle during phases they do not own. Our Sprint 1
approach instead has each member own a feature end to end — schema through API through
interface — and review the other's work. This keeps both members familiar with the whole
codebase, which also serves the availability risk identified in the proposal: neither
member holds exclusive knowledge of any part of the system.

### Fixed external deadlines with variable scope

Milestone dates are set by the course and cannot move. What can move is scope. Agile's
prioritized backlog gives us the correct lever: P0 stories are fixed, P1 and post-MVP
features are explicitly deferrable. When Sprint 1 ran long on infrastructure, the
response was to move P1 work later rather than to compress the P0 set — a decision the
process made obvious rather than one we had to invent under pressure.

## 3. Alternatives considered and why we rejected them

### Waterfall

Rejected primarily because it cannot produce a runnable increment at every milestone.
Under Waterfall, Milestone 1 would deliver a requirements and design document, and
working software would not exist until late in the semester, when there is no remaining
time to respond to what integration reveals.

The secondary reason is the one Sprint 1 illustrated: Waterfall's value depends on the
design being correct when the design phase ends. Our approved ERD had three gaps in it.
Under Waterfall those gaps become change requests against a frozen baseline. Under our
process they were three lines in a pull request description.

### Spiral

Spiral's risk-driven iterations are a reasonable fit conceptually — the proposal does
maintain a risk register, and the two highest risks (scope expansion, single-member
unavailability) are real. But Spiral's per-cycle overhead of formal risk analysis,
prototyping, and evaluation is calibrated for large projects where a wrong turn costs
months. Our project's total duration is roughly six sprints. The ceremony would consume
a meaningful share of the available time, and the risks it manages are already handled
more cheaply: scope by backlog prioritization, availability by shared full-stack
ownership and mandatory cross-review.

### Kanban (continuous flow, no sprints)

Genuinely tempting, and closer to how two people naturally work. Rejected because our
deadlines are not continuous. Four fixed milestone dates create natural batch
boundaries, and sprints that end where milestones end give us a planning cadence and a
retrospective trigger that continuous flow does not. We do borrow from Kanban in
practice: work-in-progress is effectively limited to one or two issues per member, since
each feature is owned end to end.

### Extreme Programming

We adopt several XP practices — continuous integration, test-first discipline on the
calculation logic, small releases, collective code ownership through mandatory review.
We rejected XP as the governing model because pair programming is impractical on our
schedules, and because XP's on-site customer role has no counterpart here. Our
"customer" is a fixed proposal document approved at Milestone 0, not a stakeholder
available to clarify requirements weekly.

## 4. Where we deviate from textbook Scrum, deliberately

Scrum assumes a team of roughly five to nine plus distinct Product Owner, Scrum Master,
and Development Team roles. A two-person team cannot populate those roles without the
separation becoming fictional. Our adaptations:

| Scrum element | What we do instead | Why |
|---|---|---|
| Product Owner | The Milestone 0 proposal is the source of truth for scope, ownership, and priority | Scope is fixed and externally approved; there is no stakeholder to negotiate with mid-semester |
| Scrum Master | Shared responsibility; process decisions are made jointly at sprint boundaries | No third party available, and no team large enough to need a dedicated facilitator |
| Daily standup | Weekly check-in plus asynchronous updates in the team channel | Daily synchronous meetings are not feasible around two class schedules, and with two people a blocker is communicated directly rather than surfaced in a meeting |
| Story points and velocity | Priority labels and sprint assignment, no estimation | Two sprints of history is not enough data for velocity to mean anything; the estimate would be false precision |
| Sprint commitment | Sprint assignment revisited at each boundary, with slips recorded | See §5 — we treat a missed assignment as data to record, not a commitment to defend |

Our sprint length is also at the long end of the Agile range. Two weeks was chosen so
that sprint boundaries coincide with milestone dates; a one-week sprint would put
ceremony overhead on a two-person team every week with no additional feedback value,
since our external feedback arrives at milestones.

## 5. How the process is actually enforced

A process model that lives only in a document erodes under deadline pressure. Ours is
enforced by mechanisms rather than intentions:

- **Protected `main`.** No direct commits. All work arrives through pull requests.
- **Mandatory peer review, no exceptions.** No pull request is merged by its author.
  Both members review everything, which enforces collective code ownership structurally
  rather than by agreement.
- **Definition of Done in `BACKLOG.md`**, checked per story: acceptance criteria met,
  coding standards followed, tests written and passing, CI green, peer-approved,
  integrates without regression, no known critical defects, documentation updated.
- **Conventional Commits** (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`), which keeps
  history readable and supports the Milestone 2 changelog.
- **Architecture rules documented where the code lives**, not only in design documents.
  For example, `server/src/repositories/README.md` states that repositories are the only
  modules permitted to import the Prisma client, so a developer working in that directory
  encounters the rule.
- **Continuous integration from Milestone 2**, blocking merges when linting or tests
  fail — moving enforcement from human review to automation.

## 6. Evidence from Sprint 1

Sprint 1 ran through September 16 and carried eleven issues. It is worth recording what
happened, because it is the first real test of the process.

**What was completed:** client and server workspaces scaffolded with a verified
end-to-end request path, PostgreSQL running in Docker Compose, the Prisma schema and
initial migration for all eight entities, a triaged dependency audit, and ADR-001.

**What did not start:** US-01, US-02, and US-03 — the three user stories the sprint was
planned around. All three moved to Sprint 2.

**What the process did well.** The slip was visible at the boundary rather than at the
milestone, because the sprint had an end date and a review. The board was audited
against the proposal before coding began, which surfaced five Milestone 1 deliverables
that had no owner and two issues assigned to the wrong sprint. Design gaps in the
approved ERD were caught during implementation and raised in review, not discovered
during testing.

**What the process did poorly, and what we are changing.** Sprint 1 was planned as
though foundation work were free. Scaffolding, schema, architecture decisions, and the
API contract consumed the entire sprint, and the user stories layered on top of them
never began. The infrastructure work was necessary and not wasted — but it was not
planned, which means the plan was wrong rather than the work being slow.

The consequence is that Sprint 2 now carries all ten P0 stories plus most of the design
documentation, closing September 30 with Milestone 1. That is the project's largest
current schedule risk. Two changes follow from it:

1. Infrastructure and documentation work is entered on the backlog as issues before
   sprint planning, not discovered mid-sprint. Sprint 1 created five such issues after
   the sprint had already started.
2. If Sprint 2 tightens, the protected outcome is the working end-to-end MVP. The P1
   history story (US-11) and the softer design documentation move to Milestone 2 or 3;
   no P0 story is dropped to preserve documentation.

## 7. Limits of this model, honestly stated

Two-week sprints on a six-sprint project mean only five retrospectives, so process
corrections land slowly — a mistake made in Sprint 1 is corrected in Sprint 2 at the
earliest. With no velocity data, sprint planning is judgment rather than measurement,
which is precisely what produced the Sprint 1 overcommitment. And mandatory review by
the only other team member makes each of us a hard dependency on the other: a pull
request cannot merge while its reviewer is unavailable. We accept that cost because the
alternative — self-merging under time pressure — removes the one quality gate we have
before continuous integration exists.

---

## References

[1] K. Schwaber and J. Sutherland, *The Scrum Guide*. https://scrumguides.org
[2] Manifesto for Agile Software Development. https://agilemanifesto.org
[3] B. W. Boehm, "A Spiral Model of Software Development and Enhancement,"
    *IEEE Computer*, vol. 21, no. 5, 1988.
[4] Conventional Commits specification. https://www.conventionalcommits.org