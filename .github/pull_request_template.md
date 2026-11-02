Closes #

<!-- Use "Refs #N" instead if this PR does only part of the issue. Don't write
"closes", "fixes" or "resolves" next to an issue number anywhere else in this
description: GitHub closes that issue too. -->

## What changed

<!-- What, and why. Name the files or screens a reviewer should look at first. -->

## How it was checked

<!-- The commands you ran and their results, and screenshots for a UI change. -->

## Checklist

<!-- Tick what applies; for anything that doesn't, say why under it. The QA
plan (docs/testing/qa-plan.md) explains each item. -->

- [ ] Tests added or updated for the changed behaviour, and passing locally
      (`CONTRIBUTING.md`, Before you push); integration tests too if the server
      changed
- [ ] CI is green: `server`, `client` and `integration`
- [ ] A UI change has screenshots at 375px and 1280px, with nothing scrolling
      sideways, added to `docs/design/screenshots/` for a new or changed screen
- [ ] The README and affected docs describe the code in this PR
- [ ] A line in `CHANGELOG.md` under `[Unreleased]`, citing this PR
- [ ] The issue's acceptance-criteria boxes are ticked for what this PR delivers
- [ ] A new dependency is audited in `docs/security/dependency-audit.md`
- [ ] A migration was announced to the other member before it was generated
- [ ] A bug fix adds a test that fails without the fix

**Reviewer:** check this PR against its issue's acceptance criteria and the
Definition of Done, then click **Approve** or **Request changes**. The author
doesn't merge their own PR.
