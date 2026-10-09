---
name: Technical task
about: Tests, infrastructure, a fix, or a security control, with no new user story
title: "<type>: "
labels: ""
assignees: ""
---

<!-- What is wrong or missing today, with a file or rubric reference, and why it matters. The title's type is a commit type from CONTRIBUTING.md: fix, test, infra, security, refactor or chore. -->

**Acceptance criteria**
- [ ] <!-- Something a reviewer can check in the code or the CI run, one per box -->
- [ ] Affected docs updated to match

**Dependencies and target**
- **Target:** <!-- date -->
- **Can start:** <!-- now, or after what -->
- **Waits on:** <!-- issues, or Nothing -->
- **Unblocks:** <!-- issues, or Nothing -->

<!-- Set the labels (P0 or P1, a type such as bug, infra, test or security, and an area if one applies) and the sprint milestone. -->

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
