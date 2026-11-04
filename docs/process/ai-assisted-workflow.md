# AI-assisted workflow: #90

Milestone 3 asks for "one feature or refactor completed with a disclosed
AI-assisted workflow" and "a record of what was asked of the AI and what was
accepted, edited, rejected, and why." This is that record, for **#90**: only
the payer or the recipient can record a settlement, and every expense and
settlement records who entered it. Tracked in #119.

The log below was written **while** #90 was built, entry by entry, not
reconstructed afterwards.

## The tool, and how it was used

- **Tool:** Claude Code, Anthropic's coding agent, in the Claude desktop app,
  running the **Claude Opus 5.5** model (`claude-opus-5-5`).
- **Access:** it worked in this repository on Orlando's machine. It could read
  files, run commands (tests, lint, `git`, `gh`) and edit code, each action
  shown in the session. It had no access to production secrets.
- **Who decided:** Orlando. The AI proposed designs and wrote code; Orlando
  chose between options, and every change went through the same pull request,
  CI checks and review by Agustin as any other change. Nothing merged on the
  AI's say-so.

### Beyond this one feature

This is the one feature whose workflow is recorded in detail, but AI assistance
was used across the project, not only here. Pull requests opened with Claude
Code say so at the bottom ("Generated with Claude Code"), and commits it wrote
carry a `Co-Authored-By: Claude` line. That covers planning documents, tests,
reviews of the other member's pull requests, and features such as History (#96)
and editing expenses (#98). The same rule applied throughout: the team reviewed
and approved everything before it merged.

## How to read the log

Each entry is one request made of the AI, or one decision point it raised.

- **Asked:** what the human asked, in their words where short.
- **AI output:** what the AI proposed or produced.
- **Decision:** **Accepted**, **Edited** (a human changed what the AI produced:
  what and why), or **Rejected** (and why). Where the AI offered several
  options, the ones turned down are listed as **Rejected** next to the one
  accepted. Where the AI found and corrected its own mistake
  before a human saw it, that is recorded too, as **AI self-correction**, so the
  record shows what review was needed rather than only the clean result.

## Log

### 1. Starting the feature

- **Asked:** "yes start #90 and keep the AI log" (Orlando, November 3, 2026).
- **AI output:** read #90's acceptance criteria and the code it touches
  (`services/settlement.service.ts`, `repositories/ledger.repository.ts`,
  `routes/balance.routes.ts`, the `Settlement` and `Expense` models), then,
  before writing code, put four design questions to Orlando that #90 left
  open, each with a recommendation.
- **Decision:** **Accepted** the approach of asking first. Each question's
  answer is its own entry below.

### 2. Who may record a settlement

- **AI output:** recommended **payer or recipient only**, the rule #90 and the
  threat model's H4 ask for, with anyone else refused `403
  NOT_PARTY_TO_SETTLEMENT`. The alternative offered was to also allow the
  household owner.
- **Decision:**
  - **Accepted:** payer or recipient only.
  - **Rejected:** also allowing the owner. Letting the owner record a payment
    between two other members would leave H4 half open: the owner could still
    wipe out a debt owed to someone else.
- **Not offered:** "recipient only" and "payer records, recipient confirms".
  These are the options that would stop a payer recording a payment they
  never made. The AI didn't raise them and neither did Orlando; Agustin's
  review did (entry 11).

### 3. What existing rows get for "created by"

- **AI output:** recommended a **nullable** `created_by_user_id`, left empty on
  rows that existed before the migration, rather than a backfill that guesses
  from the payer.
- **Decision:**
  - **Accepted:** nullable, left empty on existing rows. New rows always get
    the value from the session.
  - **Rejected:** backfilling from the payer. A guess would be wrong for every
    expense someone entered on another member's behalf, and a wrong trace is
    worse than an honest gap.

### 4. Whether the app shows who entered a record

- **AI output:** recommended adding `createdBy` to the API's expense and
  settlement responses, and a short "recorded by" line on History and the
  expense detail page. The alternatives were API only, or storing it without
  returning it.
- **Decision:**
  - **Accepted:** the API and a line on History and the expense detail page.
  - **Rejected:** API only, and storing it without returning it. Threat model
    M4 is about members being able to see who entered something; storing it
    where nobody can see it, or where only someone calling the API can, would
    not address that.

### 5. Whether the person who entered an expense may also edit it

- **AI output:** recommended **keeping #60's rule** (the payer or the owner)
  unchanged, even though its design note had suggested adding the creator once
  this data existed.
- **Decision:**
  - **Accepted:** keep #60's rule.
  - **Rejected:** making the person who entered an expense an editor as well.
    Changing who may edit is a separate decision with its own docs and tests;
    folding it into #90 would widen a security fix into a permissions
    redesign.

### 6. The server change

- **Asked:** build #90 to the decisions above (the same request as entry 1).
- **AI output:**
  - a migration adding nullable `created_by_user_id` to `expenses` and
    `settlements`, generated with `prisma migrate diff` and commented with
    why there is no backfill
  - `NotPartyToSettlementError` (`403 NOT_PARTY_TO_SETTLEMENT`) in
    `services/errors.ts`
  - in `createSettlement`, the requester must be `from` or `to`. The check
    runs after the field validation but before any database lookup, so a
    member learns nothing about other members by trying payments between them
  - `createdByUserId` taken from `currentUserId(req)` in both routes and passed
    down explicitly, never read from the request body
  - `createdBy` in both records and both public shapes
  - the seed sets `createdByUserId` to each record's payer, since its data is
    fictional
- **Decision:** **Accepted** after review of the diff. The ordering (validate
  first, then the 403, then lookups) is the same pattern as #105's revoke,
  where a member who isn't the owner learns nothing.

### 7. An existing test that changed meaning

- **AI output:** after the change, one existing test failed: "rejects a
  recipient outside the household (UC-08 4d)". It recorded a payment from
  Maya to an outsider while signed in as someone else, so under #90's rule it
  now got `403 NOT_PARTY_TO_SETTLEMENT` before the membership check it was
  written for. The AI did not loosen the new rule to make the old test pass.
  It changed the test to record the payment as its payer, which still tests
  what UC-08 4d is about, and added a comment saying why.
- **Decision:** **Accepted.** The AI changed the test, not the rule, and
  Orlando kept its change. Agustin checked it in review: recording as the
  payer still tests UC-08 4d for an outside recipient, and the outside-payer
  and missing-payer cases still return `MEMBER_NOT_IN_HOUSEHOLD`. Recorded
  here because changing a test to fit new code is exactly where review
  matters: had the rule been weakened instead, the test would have passed and
  H4 stayed open.

### 8. A mistake the test run caught

- **AI output:** when adding the new tests, the AI's scripted edit put the
  `NotPartyToSettlementError` import into the file's first `import { … }`
  line, which was Vitest's, not the errors import. The test failed with "The
  instanceof assertion needs a constructor but undefined was given".
- **Decision:** **AI self-correction.** It moved the import to the errors
  import and the 37 settlement tests passed. Small, but an example of why
  every change ran the suite rather than being trusted as written.

### 9. The integration test, and a line rewritten before review

- **AI output:** `recorded-by.integration.test.ts`, against PostgreSQL:
  - a third member recording a payment between two others gets 403 and
    nothing is written
  - the payer and the recipient can each record one
  - an expense stores who entered it, not who paid it, and an edit by someone
    else keeps it
  - a settlement records the signed-in member even if the body names
    someone else

  Its first draft read the household id back out of a URL with
  `base.split("/").pop()` instead of using the id the helper already returned.
- **Decision:** **AI self-correction** before anyone reviewed it: replaced
  with the returned `householdId`. It works either way, but the first version
  was a fragile way to get a value already in hand.

### 10. The client and the docs

- **AI output:**
  - `createdBy` on the client's `Expense` and `Settlement` types, a tested
    `describeRecordedBy` helper ("Recorded by Sam", "Recorded by you", nothing
    for older records), and the line on the expense detail page and on each
    payment in History
  - the docs that described the old behaviour: the API contract (both
    shapes, the new 403, the catalog), UC-08 extension 4f, the analysis
    model's note on #60's rule, the threat model (H4 and M4 now
    **Mitigated**), the OWASP review's A01 and A06, the CHANGELOG, and a
    README link to this file
- **Decision:** **Accepted** by Orlando, then reviewed in the pull request
  (entry 11).

### 11. Review: the threat model overstated the fix

- **Reviewer:** Agustin, in #127 (November 4, 2026).
- **Found:** the AI had written H4's residual risk as "None known". But the
  new rule lets the *payer* record a payment, so Sam can still record "I paid
  Maya $30" when he didn't and wipe out his own debt to her. That is the same
  harm H4 describes, done by one of the two parties instead of a third member.
  #90 makes it traceable (Maya sees "Recorded by Sam" in History), but nothing
  stops it or asks Maya to confirm. He also pointed out that entry 2 never
  offered the options that close this gap (see there), and that entry 7 was
  mislabelled.
- **Decision:** **Edited** by a human. H4's residual now reads, in Agustin's
  wording: a payer can still record a payment they never made; since #90 it
  shows as "Recorded by <payer>" in History, so the recipient can see it, but
  there is no confirmation step. Orlando **accepted** that residual rather
  than build recipient confirmation: it would add a pending state to every
  payment and change how balances are worked out, which is beyond the course's
  scope. The OWASP review's A01 notes it too. The labels in entries 2–5 and 7
  were corrected in the same change.
- **Also from review:** `describeRecordedBy` was called twice in each place it
  is shown; it is now worked out once into a `recordedBy` constant.

### 12. Merging

- **Reviewer:** Agustin approved #127 on November 4, 2026, after the changes in
  entry 11, and merged it the same day (`d6d572b`). His review checked the
  ordering of the 403, that `createdByUserId` always comes from the session
  and an edit keeps it, the migration, that the client never triggers the new
  403, and the test changed in entry 7.
- **Decision:** **Accepted** by both members, with CI's `server`, `client` and
  `integration` checks passing.

## Summary

Twelve entries:

| Kind | Entries | Notes |
|---|---|---|
| **Accepted** | 1–7, 10, 12 | including the four design recommendations in 2–5 |
| **Rejected** | 2, 3, 4, 5 | five options the AI offered and the team turned down, each with a reason |
| **Edited** by a human | 11 | the threat model's H4 residual, rewritten after review |
| **AI self-correction** | 8, 9 | a misplaced import caught by the tests; a fragile line rewritten before review |

**What review caught that the AI didn't:** the AI wrote H4's residual risk
as "None known", but the payer can still record a payment they never made.
The tests couldn't catch that, because the code did what was designed; the
design question had been framed too narrowly (entry 2). A human reviewer
reading the threat model against the rule found it. This is the main lesson
of the record: the AI was reliable at building and testing a decision, and
less reliable at noticing which options it hadn't offered.

## Checks at the end of the build

- Server: lint and typecheck clean; **490** unit tests (7 new) pass with the
  coverage targets met.
- Client: lint and build clean; **160** tests (3 new) pass.
- Integration, against PostgreSQL with the new migration applied: **38** tests
  in 10 files pass, including the 5 new ones in
  `recorded-by.integration.test.ts`. The migration matches the schema, with no
  drift (`prisma migrate diff --exit-code`).
