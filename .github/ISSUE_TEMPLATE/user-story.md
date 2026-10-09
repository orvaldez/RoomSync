---
name: User story
about: A feature a user can see, written as US-NN from the backlog
title: "US-NN: "
labels: ""
assignees: ""
---

As a <role>, I want to <action>, so that <benefit>.

<!-- What exists already (schema, contract, analysis model) and what is missing. -->

**Acceptance criteria**
- [ ] <!-- Behavior a reviewer can check, one per box -->
- [ ] Someone outside the household gets 404; a member without the needed role gets 403
- [ ] Endpoints in `docs/design/api-contract.md`, with any new error codes in its catalog
- [ ] Service and route tests for each case above
- [ ] UC-NN added to `docs/requirements/use-cases.md`; US-NN added to `BACKLOG.md`

**Dependencies and target**
- **Target:** <!-- date -->
- **Can start:** <!-- now, or after what -->
- **Waits on:** <!-- issues, or Nothing -->
- **Unblocks:** <!-- issues, or Nothing -->

<!-- Set the labels (P0 or P1, and an area) and the sprint milestone. -->

---
**Definition of Done**
- [ ] Meets the acceptance criteria above, each box ticked as it lands
- [ ] Follows project coding standards and the Routes -> Services -> Repositories layering
- [ ] Relevant unit or integration tests written and passing
- [ ] CI checks pass
- [ ] Approved by the other team member before merge (not merged by its author)
- [ ] PR body says `Closes #<this issue>`
- [ ] Does not break existing functionality
- [ ] README and affected docs updated
