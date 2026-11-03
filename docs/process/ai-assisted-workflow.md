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
- **Decision:** **Accepted**, **Edited** (what was changed and why), or
  **Rejected** (and why). Where the AI found and corrected its own mistake
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
- **Decision:** **Accepted** the recommendation. Letting the owner record a
  payment between two other members would leave H4 half open: the owner could
  still wipe out a debt owed to someone else.

### 3. What existing rows get for "created by"

- **AI output:** recommended a **nullable** `created_by_user_id`, left empty on
  rows that existed before the migration, rather than a backfill that guesses
  from the payer.
- **Decision:** **Accepted.** A guess would be wrong for every expense someone
  entered on another member's behalf, and a wrong trace is worse than an
  honest gap. New rows always get the value from the session.

### 4. Whether the app shows who entered a record

- **AI output:** recommended adding `createdBy` to the API's expense and
  settlement responses, and a short "recorded by" line on History and the
  expense detail page. The alternatives were API only, or storing it without
  returning it.
- **Decision:** **Accepted.** Threat model M4 is about members being able to
  see who entered something; storing it where nobody can see it would not
  address that.

### 5. Whether the person who entered an expense may also edit it

- **AI output:** recommended **keeping #60's rule** (the payer or the owner)
  unchanged, even though its design note had suggested adding the creator once
  this data existed.
- **Decision:** **Accepted.** Changing who may edit is a separate decision with
  its own docs and tests; folding it into #90 would widen a security fix into a
  permissions redesign.

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
- **Decision:** **Edited** (the test, not the rule). Recorded here because
  changing a test to fit new code is exactly where review matters: had the
  rule been weakened instead, the test would have passed and H4 stayed open.

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
- **Decision:** **Accepted**, pending review in the pull request.

## Checks at the end of the build

- Server: lint and typecheck clean; **490** unit tests (7 new) pass with the
  coverage targets met.
- Client: lint and build clean; **160** tests (3 new) pass.
- The integration test (`recorded-by.integration.test.ts`, 5 tests, with the
  migration) runs in CI's `integration` job; Docker wasn't running locally
  when this was written.

## Still to record

- What review of the pull request (#127) changes, if anything, and the final
  decision on merging. To be added as further entries.
