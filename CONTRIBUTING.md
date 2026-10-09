# Contributing to RoomSync

RoomSync is built by two people, and every change reaches `main` the same way:
an issue, a short-lived branch, a pull request, a green CI run, and an
approval from the other member. This file is the reference for each step. The
reasoning behind the process is in [`docs/process-model.md`](./docs/process-model.md).

## The short version

1. Pick an issue assigned to you in the current sprint's milestone.
2. Branch from an up-to-date `main`: `git checkout -b feature/chore-reminders`.
3. Commit with Conventional Commits: `feat: add chore reminders`.
4. Run the checks locally (see [Before you push](#before-you-push)).
5. Open a pull request whose title is a Conventional Commit and whose body
   starts with `Closes #N`.
6. The other member reviews, clicks **Approve**, and merges.

## Branches

Every change is made on a branch from `main`, named `<type>/<short-description>`
in lowercase words joined by hyphens, one branch per issue.

| Prefix | For | Example from this repo |
|---|---|---|
| `feature/` | A user story or new behavior | `feature/balances-settlements` (#54) |
| `fix/` | A bug fix | `fix/household-ui-followups` (#48) |
| `test/` | Tests only | `test/integration-setup` (#83) |
| `docs/` | Documentation only | `docs/threat-model` (#91) |
| `chore/` | Repository settings and housekeeping | `chore/required-status-checks` (#82) |
| `infra/` | CI, tooling and build setup | `infra/ci` (#81) |
| `security/` | A security control | `security/rate-limit` (#88) |

`main` is protected (see [`docs/process/branch-protection.md`](./docs/process/branch-protection.md)):
nobody, including the repository admin, can push to it directly, force-push
it, or delete it.

## Commits and pull request titles

Commits follow [Conventional Commits](https://www.conventionalcommits.org):
`<type>: <summary>`, with the summary in lowercase, in the imperative, and
without a final period.

| Type | For | Example from this repo |
|---|---|---|
| `feat` | A new feature or user-visible behavior | `feat: add balances and settlements` (#54) |
| `fix` | A bug fix | `fix: recover from existing household and expired session on dashboard` (#48) |
| `test` | Adding or changing tests only | `test: add the household and invitation integration flow` (#87) |
| `docs` | Documentation only | `docs: add the threat model for the main attack surfaces` (#91) |
| `refactor` | A code change with no change in behavior | None yet |
| `chore` | Repository settings and housekeeping | `chore: require the CI jobs as status checks on main` (#82) |
| `infra` | CI, linting, build tooling | `infra: run lint, typecheck, build and tests in GitHub Actions` (#81) |
| `security` | A security control | `security: rate-limit login and registration` (#88) |

The first six are standard Conventional Commits types. `infra` and `security`
are this project's own, matching the `infra` and `security` labels.

**Pull requests are squash-merged**, which is the only merge method the
ruleset allows. The pull request's title becomes the one commit on `main`, and
GitHub adds the PR number: `security: rate-limit login and registration (#88)`.
So the PR title is the commit message that matters and must follow the format
above. Commits on the branch should follow it too, but they don't reach `main`.

## Pull requests

**The body:**

- Starts with `Closes #N`, so the issue closes when the PR merges and links
  to it. If the PR does only part of an issue, write `Refs #N` instead.
- Says what changed and how it was checked: tests run, screenshots, evidence.
- Doesn't use `closes`, `fixes` or `resolves` next to an issue number anywhere
  else. GitHub treats each as an instruction, whatever the sentence says; "the
  last PR closes #61" in #83 closed #61 early.

**Before it can merge**, which the ruleset enforces:

- The three CI checks pass: `server`, `client` and `integration`.
- One approving review. GitHub doesn't let an author approve their own PR, so
  that is always the other member.
- Every review conversation is resolved.
- Pushing a new commit dismisses an earlier approval, so the reviewer approves
  the code that actually merges.

**Team rules on top of the ruleset:**

- **The author never merges their own PR.** The reviewer approves and merges.
- **Approve with the button.** Merging is not a substitute for approving:
  only an approval leaves a record that the code was reviewed.
- **After changes are requested**, push the fixes, reply to each comment, and
  re-request review. A PR with requested changes is reviewed again, not
  merged as it stands.
- **Add a line to `CHANGELOG.md`** under `[Unreleased]`, in the right group
  (Added, Changed, Fixed, Security), citing the PR number. See the
  versioning section of [`CHANGELOG.md`](./CHANGELOG.md).
- **Tick the issue's boxes** as the work lands, not all at once at the end.

## Reviewing

The reviewer checks the PR against its issue, not only against the diff:

- Each acceptance criterion is actually met in the code, and its box can be
  ticked.
- The Definition of Done holds (below).
- Claims in the PR body and the docs match the code on the branch.
- The layering holds: routes call services, services call repositories, and
  only repositories touch the database. The server lint enforces the import
  rules (`docs/architecture/layering-lint.md`); review covers the rest.

Then click **Approve**, or **Request changes** with what needs to change.

## Issues

**Every piece of work is an issue** before it starts. Use one of the
templates (**New issue** on GitHub):

| Template | Title | Example |
|---|---|---|
| User story | `US-NN: <the story in a few words>` | `US-14: revoke an invitation` (#75) |
| Technical task | `<type>: <what changes>`, with a commit type from above | `infra: server ESLint with the Prisma import restriction from ADR-001` (#69) |
| Docs task | `docs: <what the document covers>` | `docs: threat model for the main attack surfaces` (#70) |

Each issue body has the same parts: what and why, **Acceptance criteria** as
checkboxes, **Dependencies and target** (target date, what it waits on, what
it unblocks), and the **Definition of Done**. Tick each box as it lands.

**Labels.** Every issue gets one of each that applies:

- **Priority:** `P0` (needed for the milestone) or `P1` (planned, can slip to
  the next milestone).
- **Area:** `account`, `household`, `expense`, `chore` or `dashboard`.
- **Type:** `bug`, `docs`, `infra`, `test`, `security` or `accessibility`. A
  user story needs no type label.

**Milestones are sprints.** Sprint 3 ends October 14 and Sprint 4 on November
2, 2026, with Milestone 2. Set the milestone by hand; templates can't set it.

**Assign it** to whoever will do it. Blocked for more than a day? Say so on
the issue and pick up something else (`BACKLOG.md`, working rules).

## Definition of Done

An issue is done when the work meets the Definition of Done in
[`BACKLOG.md`](./BACKLOG.md#definition-of-done). In short: acceptance criteria
met and ticked, coding standards and layering followed, tests written and
passing, CI green, approved by the other member and not merged by its author,
`Closes #N` in the PR, nothing existing broken, no known critical defects,
and the README and affected docs updated.

Docs tasks use a shorter version: in place of the code items, every claim is
checked against the code on `main`, and the document is linked from the
README's Documentation section. Each issue template carries the right one.

## Before you push

Run what CI runs, in the directory you changed:

```bash
cd server && npm run typecheck && npm run lint && npm test
```

```bash
cd client && npm run lint && npm run build && npm test
```

With the database running (`docker compose up -d`), also run the server's
integration tests:

```bash
cd server && npm run test:integration
```

The README's [Tests](./README.md#tests) section explains each suite.

## Database migrations

Tell the other member **before** generating a migration, so two migrations
don't collide (`BACKLOG.md`, working rules). Generate it with
`npm run db:migrate` in `server/` and commit the new folder under
`server/prisma/migrations/` with the schema change.
