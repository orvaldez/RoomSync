# Semester retrospective

> **Draft, November 3, 2026.** Milestones 0 to 2 are written from the record.
> Milestone 3 is written up to the start of Sprint 5 and is finished after the
> feature freeze (November 23), with what deployment, the metrics and the
> demo actually showed. **Section 6 is for each member to write in their own
> words**; it holds prompts, not answers. Tracked in #123.

What we built, how the way we worked held up, and what we would do
differently, across the four milestones of the course. The evidence behind
each point is a pull request, a file or a measured number; the
[metrics report](./metrics.md) and the [risk register](./risk-register.md) hold
the detail, and the [process model](../process-model.md) (§6 to §8) has the
retrospective notes from each sprint boundary.

## 1. The semester at a glance

| | Milestone 0 | Milestone 1 | Milestone 2 | Milestone 3 |
|---|---|---|---|---|
| Goal | Propose | Build the MVP | Test, improve, secure | Deploy |
| Due | Tagged September 2 | September 30 | November 2 | November 30 |
| Tag | `milestone-0` | `milestone-1` / `v0.1.0` | `milestone-2` / `v0.3.0` | `milestone-3` / `v1.0.0` *(to come)* |
| User stories done | — | US-01 to US-10 | US-11, US-12, US-14 | *(to finish)* |
| Pull requests merged | — | 26 | 27 | *(to finish)* |
| Automated tests | 0 | 499 | 673 | *(to finish)* |
| Reviewed by the other member | — | 17 of 26 | 27 of 27 | *(to finish)* |

## 2. Milestone by milestone

### Milestone 0: Propose

- **Went well:** the proposal fixed the decisions the rest of the semester
  stood on. A standing household rather than trip-based splitting; integer
  cents and derived balances (FR-18, NFR-03); a layered server (later ADR-001);
  and a P0 MVP with P1 later features, so scope had a rule from day one.
- **Went poorly:** little that the record shows. The repository held only the
  proposal, a README and the backlog, which was right for the milestone.
- **Carried forward:** the risk table (§11), which the risk register now
  checks against what happened.

### Milestone 1: Build the MVP

- **Went well:**
  - **The full MVP shipped, not a reduced one.** All ten P0 stories, built end to
    end with their design documents (`BACKLOG.md`, Sprint 2 outcome).
  - **Foundation first paid off.** Sprint 1 went to the schema, the layered
    server and the API contract. After the first feature had gone through
    contract, repository, service, route and screen, the rest followed the
    same shape (`process-model.md` §7).
  - **Ownership moved instead of stalling.** Balances, settlements and the
    dashboard moved to Agustin mid-sprint, so neither member waited.
- **Went poorly:**
  - **Sprint 1's stories didn't start.** None of the three planned stories began
    in Sprint 1, and Sprint 2 carried the whole P0 set.
  - **Review was skipped four times.** #35, #41, #50 and #52 were merged by
    their author. Two of them (#41, #52) turned out to be missing acceptance
    criteria, which were found and completed in #58 before submission.
  - **Most work merged at the end.** 22 of the 26 pull requests merged in the
    last three days (metrics §4).
- **Changed for the next milestone:** branch protection (#80) so review was
  enforced by the repository, not by memory; and dependencies between the two
  members written on every issue.

### Milestone 2: Test, improve and secure

- **Went well:**
  - **Everything graded shipped:** three new stories, integration and
    component tests, coverage targets, CI with required checks, a threat
    model, an OWASP review, rate limiting with before-and-after evidence, and
    three tagged releases.
  - **Review became universal.** 27 of 27 pull requests were approved by the
    other member, and none was merged by its author (metrics §4).
  - **The checks caught real defects before release:**
    - **the fresh-clone check:** a walkthrough step that couldn't be followed
      (#104)
    - **a real iPhone:** two layout bugs that headless browsers missed (#107,
      #109)
    - **the OWASP review:** requests answered with 500 instead of 4xx (#103)
    - **a concurrency test:** a race that let one user join two households
      (#111)
  - **Planning dependencies explicitly worked** for the building: nobody waited
    on the other to write code.
- **Went poorly:**
  - **Merging, not building, slipped.** Nothing merged between October 15 and
    November 1, and 14 pull requests merged on November 2, the due date.
  - **The October 28 feature freeze** passed with nothing merged.
  - **Merging all at once had concrete costs** (`process-model.md` §8):
    - an approval dismissed by a rebase (#96)
    - a stacked pull request merged into the wrong branch (#108, re-applied
      as #113)
    - changelog entries landing in the wrong release
    - the `milestone-2` tag landing one commit before its changelog cut
- **Changed for the next milestone** (`BACKLOG.md`, working rules for Sprints 5
  and 6):
  - review within one working day, and merge on approval
  - retarget stacked pull requests before merging
  - freeze a full week out, and deploy first
  - tag the changelog-cut commit

### Milestone 3: Deploy *(in progress)*

- **So far (November 3):** the plan is in place: Sprint 5 and Sprint 6, ten
  issues, owners following the proposal (#126). Four pieces of work are in
  review on the first day of Sprint 5:
  - the AI-assisted feature with its record (#127)
  - the risk register and maintenance plan (#128)
  - the metrics report (#129)
  - security-event logging (#130)
- **Watching:** the same pattern as Milestone 2 had started again. On
  November 3, five pull requests were waiting for review. Whether the new
  working rules break that pattern is the main question for this section.
- **To write after the freeze:**
  - how deployment went (#116 to #118), and what the free tier did to it
  - deployment frequency (metrics §3)
  - whether review kept to one working day
  - the demo

## 3. How the process held up

| Practice | What we planned | What happened | Verdict |
|---|---|---|---|
| Two-week sprints | Six sprints, each ending with a retrospective note | Five so far, with notes at each boundary (`process-model.md` §6 to §8). Sprint 4 ran to November 2 to meet the due date | **Kept** |
| Backlog and issues | Every piece of work an issue, labelled, owned, in a sprint | Held throughout. From Milestone 2, every issue also carried a target and its dependencies | **Kept, improved** |
| Definition of Done | Acceptance criteria met, tested, reviewed, documented | The criteria were met but the boxes weren't ticked until an audit on October 5; ticked as work landed after that | **Kept, after a fix** |
| Code review | The other member reviews every pull request | Skipped four times in Milestone 1; enforced by branch protection from October 7, and universal in Milestone 2 | **Kept, once enforced** |
| Continuous integration | Lint and tests on every pull request; blocking from Milestone 3 | In place from October 7, blocking from the start rather than from Milestone 3. No run on `main` has failed on code (metrics §2) | **Ahead of plan** |
| Feature freeze | October 28 for Milestone 2 | Passed with nothing merged; the freeze had nothing to freeze | **Didn't work.** Moved a week earlier for Milestone 3 |
| Dependencies between members | Written on every issue, with what to deliver first | Worked for building; didn't cover review, which only the other member can do | **Partly** |

**The one lesson that runs through all of it:** we were consistently good at
building, and consistently late at **integrating**. Both milestones' work
landed on `main` in a burst at the end (22 of 26, then 14 on one day). Every
costly incident of the semester traces back to that, not to the code.

## 4. The success criteria

From the proposal's §12. Each is checked at the milestone where it became
applicable; SC-12 and SC-13 are finished at `v1.0.0`.

| | Criterion | Status | Evidence |
|---|---|---|---|
| SC-01 | Account access | **Met** | US-01, US-02; sessions in PostgreSQL; integration flow `auth.integration.test.ts` |
| SC-02 | Household management | **Met** | US-03, US-04, US-14; `household.integration.test.ts` |
| SC-03 | Expense management | **Met** | US-05, and editing and deleting (US-12) |
| SC-04 | Accurate expense splitting | **Met** | 41 split tests including remainder cents; balances checked against hand-worked amounts (`money.integration.test.ts`); services at 99% coverage |
| SC-05 | Balance tracking | **Met** | US-07; derived on every read (NFR-03); integration-tested from each member's side |
| SC-06 | Settlement recording | **Met** | US-08; overpaying refused under a lock. #90 (in review, #127) limits recording to the payer or recipient |
| SC-07 | Chore management | **Met** | US-09; only the assignee completes (`chore.integration.test.ts`) |
| SC-08 | Dashboard | **Met** | US-10; one request; under 30 ms with 500 expenses (NFR-02) |
| SC-09 | Security | **Met** | Every household endpoint answers 404 to an outsider, tested against PostgreSQL (`isolation.integration.test.ts`); threat model and OWASP review |
| SC-10 | Testing | **Met** | Unit and integration tests for splitting, balances and authorization; all three CI jobs required on every pull request |
| SC-11 | Independent execution | **Met** at Milestones 1 and 2 | The README's setup; at Milestone 2, a fresh-clone run following only the README (#104) |
| SC-12 | Deployment | *To finish* | #117 |
| SC-13 | Maintainability | *To finish* | The fresh-clone check at `v1.0.0` (#122); the repository's documentation, history and issues |

## 5. What we would do differently

1. **Integrate continuously, not at the end.** Merge each pull request the day
   it's approved, and treat a pull request waiting more than a day as a
   blocker, not a queue. This one change would have avoided most of Milestone
   2's incidents.
2. **Plan for review, not only for building.** In a team of two, review is the
   one task the other person can't take over. Agree on review times at the
   start of each sprint, as concretely as delivery dates.
3. **Make the freeze mean something** by merging before it, so it freezes work
   that is already on `main`.
4. **Deploy early.** The proposal said so, and Milestone 3's plan does it on
   November 10. Whether that was early enough goes here after the freeze.
5. **Measure sooner.** Coverage, complexity and review times would have shown
   the patterns above weeks earlier than we noticed them. The metrics report
   came at Milestone 3; a version of it at Milestone 1 would have been more
   useful.

## 6. What each member learned

*Each member writes this part themselves. The prompts are only a starting
point; answer any, all or none of them.*

### Orlando Rodriguez Valdez

> *To write.* Some prompts:
> - What was hardest technically, and what would you do the same way again?
> - What did working with an AI coding agent change about how you built,
>   reviewed or tested things, and what did you have to check yourself?
> - What did reviewing Agustin's work teach you that writing your own didn't?
> - Which practice from this course would you use on your next project?

### Agustin Lemuz-Juarez

> *To write.* Some prompts:
> - What was hardest technically, and what would you do the same way again?
> - What did owning CI, containers and deployment teach you?
> - What did reviewing Orlando's work teach you that writing your own didn't?
> - Which practice from this course would you use on your next project?
