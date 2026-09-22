# RoomSync API Contract - v1

RoomSync - CS 415: Software Design and Development
Orlando Rodriguez Valdez, Agustin Lemuz-Juarez
Issue #3 · Milestone 1 deliverable

This contract defines every endpoint the Milestone 1 MVP exposes. Routes are
implemented against it; a change to an endpoint's request, response, or error
codes is made here first, in a pull request both members approve.

Each endpoint maps to a user story in `BACKLOG.md` and a use case in
`docs/use-cases.md`. Extension numbers (for example "UC-04 6b") point at the
use case step the error comes from.

---

## 1. Conventions

**Base path.** Every endpoint is under `/api`. In development the Vite server
proxies `/api` to Express on port 4000.

**Authentication.** Session-based, per proposal Section 6. `POST /api/auth/login`
sets an `httpOnly`, `SameSite=Lax` session cookie. Every endpoint marked
**Auth: required** rejects a request without a valid session with
`401 UNAUTHENTICATED`, including direct API calls, not only page navigation
(FR-03).

**Household scoping.** Every endpoint under `/api/households/:householdId`
verifies on the server that the requester is a member of that household
(NFR-06, NFR-07, SC-09). A non-member receives `404 HOUSEHOLD_NOT_FOUND`, the
same response as a household that does not exist, so the API never confirms
that another household exists. A member who lacks the `OWNER` role on an
owner-only action receives `403 NOT_HOUSEHOLD_OWNER`.

**Money.** Every monetary value in a request or response is an integer number
of cents, and every field holding one ends in `Cents` (FR-18). The client
converts "$12.34" to `1234` before sending. A non-integer, zero, or negative
amount is rejected with `400 VALIDATION_FAILED`.

**Percentages.** Percentage splits use integer basis points, where 100% is
`10000` and 33.33% is `3333`, matching `percent_basis_points` in the schema.

**Dates.** Timestamps are ISO 8601 strings in UTC (`2026-09-22T17:30:00.000Z`).
Calendar dates the user picks (`expenseDate`, `dueDate`) are sent as
`YYYY-MM-DD`.

**IDs.** All IDs are opaque strings (cuid). Clients must not parse them.

**Errors.** Every error response, from every endpoint, has one shape:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Validation failed" } }
```

- `code` is a stable, machine-readable name from the catalog in Section 5.
  Clients branch on `code`, never on `message`.
- `message` is human-readable and may change wording at any time.
- `fields` is present only on `VALIDATION_FAILED`, and maps each invalid field
  to its own message, so a form can show every error at once:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed",
    "fields": { "email": "Enter a valid email address." }
  }
}
```

**Errors every endpoint can return.** These are not repeated per endpoint:

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_JSON` | The request body is not valid JSON |
| 401 | `UNAUTHENTICATED` | Auth-required endpoint, no valid session |
| 404 | `HOUSEHOLD_NOT_FOUND` | Household-scoped endpoint, household missing or requester not a member |
| 500 | `INTERNAL_ERROR` | Unexpected failure. The message is generic; details are logged, never returned |

---

## 2. Shared types

```ts
UserPublic       { id, name, email, createdAt }
MemberPublic     { userId, name, role: "OWNER" | "MEMBER", joinedAt }
HouseholdPublic  { id, name, createdAt, role: "OWNER" | "MEMBER" }   // role = requester's role
InvitationPublic { id, token, status, expiresAt, createdAt }
SharePublic      { userId, name, amountOwedCents, percentBasisPoints: number | null }
ExpensePublic    { id, description, totalAmountCents, expenseDate,
                   paidBy: { userId, name }, splitMethod: "EQUAL" | "CUSTOM" | "PERCENTAGE",
                   shares: SharePublic[], createdAt }
SettlementPublic { id, from: { userId, name }, to: { userId, name },
                   amountCents, note: string | null, settledAt }
ChorePublic      { id, title, description: string | null,
                   assignee: { userId, name } | null, dueDate: string | null,
                   isComplete, completedAt: string | null, createdAt }
BalancePublic    { userId, name, netCents }
```

`UserPublic` never includes the password hash. `MemberPublic` deliberately
omits email: roommates identify each other by name, and NFR-06 says personal
account information is not exposed further than needed.

`BalancePublic.netCents` is from the requester's point of view: **positive**
means that member owes the requester, **negative** means the requester owes
that member, zero means settled.

---

## 3. Endpoint summary

| Method | Path | Request body | Success | Story |
|---|---|---|---|---|
| GET | `/api/health` | none | 200 `{ status, service }` | infra |
| POST | `/api/auth/register` | `{ name, email, password }` | 201 `{ user }` | US-01 |
| POST | `/api/auth/login` | `{ email, password }` | 200 `{ user }` + session cookie | US-02 |
| POST | `/api/auth/logout` | none | 204 | US-02 |
| GET | `/api/auth/me` | none | 200 `{ user }` | US-02 |
| POST | `/api/households` | `{ name }` | 201 `{ household }` | US-03 |
| GET | `/api/households/current` | none | 200 `{ household }` or `{ household: null }` | US-03, US-10 |
| GET | `/api/households/:householdId/members` | none | 200 `{ members }` | US-03, US-04 |
| POST | `/api/households/:householdId/invitations` | none | 201 `{ invitation }` | US-04 |
| GET | `/api/invitations/:token` | none | 200 `{ invitation }` | US-04 |
| POST | `/api/invitations/:token/accept` | none | 200 `{ household }` | US-04 |
| POST | `/api/households/:householdId/expenses/preview` | expense body | 200 `{ shares }` | US-05, US-06 |
| POST | `/api/households/:householdId/expenses` | expense body | 201 `{ expense }` | US-05, US-06 |
| GET | `/api/households/:householdId/expenses` | none | 200 `{ expenses }` | US-05, US-11 |
| GET | `/api/households/:householdId/expenses/:expenseId` | none | 200 `{ expense }` | US-05 |
| GET | `/api/households/:householdId/balances` | none | 200 `{ balances, totals }` | US-07 |
| POST | `/api/households/:householdId/settlements` | `{ fromUserId, toUserId, amountCents, note? }` | 201 `{ settlement }` | US-08 |
| GET | `/api/households/:householdId/settlements` | none | 200 `{ settlements }` | US-08, US-11 |
| POST | `/api/households/:householdId/chores` | `{ title, description?, assignedUserId?, dueDate? }` | 201 `{ chore }` | US-09 |
| GET | `/api/households/:householdId/chores` | none | 200 `{ chores }` | US-09 |
| PATCH | `/api/households/:householdId/chores/:choreId` | `{ title?, description?, assignedUserId?, dueDate? }` | 200 `{ chore }` | US-09 |
| POST | `/api/households/:householdId/chores/:choreId/complete` | none | 200 `{ chore }` | US-09 |
| GET | `/api/households/:householdId/dashboard` | none | 200 `{ household, members, balances, upcomingChores, recentActivity }` | US-10 |

23 endpoints. US-11 (P1, history) is served by the list endpoints above, so it
needs no new routes.

---

## 4. Endpoints

### Health

## GET /api/health
Auth: none
Success: 200 { status: "ok", service: "roomsync-api" }
Errors: none

### Accounts (US-01, US-02) - owner: Orlando

## POST /api/auth/register
Auth: none. Does not create a session; the client sends the user to log in (UC-01 step 7).
Request: { name: string, email: string, password: string }
Rules: name 1-100 chars after trim; email trimmed and lowercased before the
  uniqueness check; password at least 8 characters and at most 72 bytes (bcrypt's input limit).
Success: 201 { user: UserPublic }
Errors:
  400 VALIDATION_FAILED        - "Validation failed" (fields: name, email, password)     UC-01 3a, 3b
  409 EMAIL_UNAVAILABLE        - "Registration could not be completed."                  UC-01 4a

The 409 message never confirms whether the address is registered. The status
code still narrows it down for a determined prober; closing that fully needs
email verification, which is out of MVP scope. Recorded for the Milestone 2
threat model.

## POST /api/auth/login
Auth: none
Request: { email: string, password: string }
Success: 200 { user: UserPublic }, and sets the session cookie
Errors:
  400 VALIDATION_FAILED        - "Validation failed" (fields: email, password)
  401 INVALID_CREDENTIALS      - "Invalid email or password."                            UC-02 3a-4a

Unknown email and wrong password return the identical code, message, and
comparable response time, so the response does not reveal which accounts exist.

## POST /api/auth/logout
Auth: required
Success: 204, session destroyed and cookie cleared
Errors: common errors only

## GET /api/auth/me
Auth: required
Success: 200 { user: UserPublic }
Errors: common errors only

The client calls this on load to decide between the login screen and the app.

### Households and invitations (US-03, US-04) - owner: Agustin

## POST /api/households
Auth: required
Request: { name: string }
Rules: name 1-100 chars after trim. Household and OWNER membership are created
  in one transaction (UC-03 special requirement).
Success: 201 { household: HouseholdPublic }   (role is "OWNER")
Errors:
  400 VALIDATION_FAILED        - "Validation failed" (fields: name)                      UC-03 3a
  409 ALREADY_IN_HOUSEHOLD     - "You already belong to a household."                    UC-03 1a

## GET /api/households/current
Auth: required
Success: 200 { household: HouseholdPublic } or 200 { household: null }
Errors: common errors only

Returns the requester's one household, or `null` when they have none, which the
client uses to show the create-or-join screen (UC-02 6a, UC-10 2a). Having no
household is a normal state, so it is not an error.

## GET /api/households/:householdId/members
Auth: required, member
Success: 200 { members: MemberPublic[] }   ordered by joinedAt
Errors: common errors only

## POST /api/households/:householdId/invitations
Auth: required, OWNER only
Request: none
Rules: token from a cryptographically secure source (crypto.randomBytes(32),
  base64url). Expires 7 days after creation. Status PENDING.
Success: 201 { invitation: InvitationPublic }
Errors:
  403 NOT_HOUSEHOLD_OWNER      - "Only the household owner can invite roommates."        UC-04 1a

The client builds the shareable link as `<app origin>/join/<token>`. RoomSync
does not send email in the MVP (UC-04 step 4).

## GET /api/invitations/:token
Auth: required (an unauthenticated visitor is sent to log in or register, then back; UC-04 step 7)
Success: 200 { invitation: { householdName: string, expiresAt: string } }
Errors:
  404 INVITATION_INVALID       - "This invitation is not valid."                         UC-04 6a, 6c
  410 INVITATION_EXPIRED       - "This invitation has expired. Ask for a new one."       UC-04 6b

Used for the confirmation screen (UC-04 step 8). Reveals only the household
name. A token that never existed and one already used return the same error.

## POST /api/invitations/:token/accept
Auth: required
Request: none
Success: 200 { household: HouseholdPublic }   (role is "MEMBER")
Errors:
  404 INVITATION_INVALID       - "This invitation is not valid."                         UC-04 6a, 6c
  410 INVITATION_EXPIRED       - "This invitation has expired. Ask for a new one."       UC-04 6b
  409 ALREADY_IN_HOUSEHOLD     - "You already belong to a household."                    UC-04 9a

If the requester is already a member of this same household, the call succeeds
with no change (UC-04 9b). On success the invitation becomes ACCEPTED. When an
expired invitation is looked up, its status is set to EXPIRED.

### Expenses (US-05, US-06) - owner: Agustin

**Expense body**, shared by `preview` and create:

```ts
{
  description: string,               // 1-200 chars after trim
  totalAmountCents: number,          // positive integer
  expenseDate: string,               // "YYYY-MM-DD"
  paidByUserId: string,              // must be a household member
  splitMethod: "EQUAL" | "CUSTOM" | "PERCENTAGE",
  participants: [
    {
      userId: string,                // must be a household member, no duplicates
      amountCents?: number,          // required for CUSTOM, ignored otherwise
      percentBasisPoints?: number    // required for PERCENTAGE, ignored otherwise
    }
  ]
}
```

**Split rules** (UC-06, SC-04). All arithmetic is integer.
- EQUAL: `floor(total / n)` each. The remainder is given one cent at a time to
  participants in the order they appear in `participants`.
- CUSTOM: each `amountCents` must be a non-negative integer, and they must sum
  exactly to `totalAmountCents`. Nothing is adjusted silently.
- PERCENTAGE: each `percentBasisPoints` must be a non-negative integer, and
  they must sum to exactly `10000`. Each share is
  `floor(total * bp / 10000)`; the remainder is distributed as in EQUAL.
- In every method, shares must sum exactly to `totalAmountCents`. The server
  checks this unconditionally before writing (FR-09, UC-05 9a).

## POST /api/households/:householdId/expenses/preview
Auth: required, member
Request: expense body
Success: 200 { shares: SharePublic[] }
Errors: the same codes as create (below). Writes nothing.

Lets the client show the calculated shares before the member confirms
(UC-05 step 7) without duplicating the split logic in the browser. The server
remains the only place shares are calculated.

## POST /api/households/:householdId/expenses
Auth: required, member
Request: expense body
Success: 201 { expense: ExpensePublic }
  The expense and all its shares are written in one transaction (UC-05 10a).
Errors:
  400 VALIDATION_FAILED        - "Validation failed"                                     UC-05 2a, 2b, 2c
                                 (fields: description, totalAmountCents, expenseDate,
                                  splitMethod, participants)
  400 NO_PARTICIPANTS          - "Select at least one participant."                      UC-05 4a
  400 PAYER_NOT_MEMBER         - "The payer must be a household member."                 UC-05 3a
  400 PARTICIPANT_NOT_MEMBER   - "Every participant must be a household member."
  400 DUPLICATE_PARTICIPANT    - "A participant appears more than once."
  400 SPLIT_SUM_MISMATCH       - "Custom amounts must add up to the total."              UC-06 custom 3a
  400 PERCENT_SUM_INVALID      - "Percentages must add up to 100."                       UC-06 percentage 3a

## GET /api/households/:householdId/expenses
Auth: required, member
Success: 200 { expenses: ExpensePublic[] }   newest expenseDate first, then newest createdAt
Errors: common errors only

## GET /api/households/:householdId/expenses/:expenseId
Auth: required, member
Success: 200 { expense: ExpensePublic }
Errors:
  404 EXPENSE_NOT_FOUND        - "Expense not found."

An expense belonging to another household returns `EXPENSE_NOT_FOUND`, never
the expense.

### Balances and settlements (US-07, US-08) - owner: Orlando

## GET /api/households/:householdId/balances
Auth: required, member
Success: 200 {
  balances: BalancePublic[],                        // one per other member, including zeros
  totals: { youOweCents: number, owedToYouCents: number }
}
Errors: common errors only                                                                UC-07 1a

Derived from expense shares and settlements on every request, never stored or
cached (NFR-03). A member with no activity gets a zero entry for every other
member, not an empty list (UC-07 2a).

## POST /api/households/:householdId/settlements
Auth: required, member
Request: { fromUserId: string, toUserId: string, amountCents: number, note?: string }
  from = the member who paid off a debt, to = the member who was owed.
  note is optional, at most 200 chars.
Success: 201 { settlement: SettlementPublic }
Errors:
  400 VALIDATION_FAILED        - "Validation failed" (fields: amountCents, note)         UC-08 4b
  400 SAME_MEMBER              - "A member cannot settle with themselves."               UC-08 4c
  400 MEMBER_NOT_IN_HOUSEHOLD  - "Both members must belong to this household."           UC-08 4d
  409 EXCEEDS_BALANCE          - "That is more than is currently owed."                  UC-08 4a, 4e

The outstanding balance is recomputed at write time, inside the same
transaction, not taken from what the client displayed (UC-08 4e). If `from`
does not owe `to` anything, any amount returns `EXCEEDS_BALANCE`.

## GET /api/households/:householdId/settlements
Auth: required, member
Success: 200 { settlements: SettlementPublic[] }   newest settledAt first
Errors: common errors only

Settlements stay listed after the balance reaches zero (US-08, FR-12).

### Chores (US-09) - owner: Agustin

## POST /api/households/:householdId/chores
Auth: required, member
Request: { title: string, description?: string, assignedUserId?: string, dueDate?: string }
Rules: title 1-100 chars after trim; description at most 500 chars; dueDate
  "YYYY-MM-DD". A past due date is accepted (UC-09 4a).
Success: 201 { chore: ChorePublic }
Errors:
  400 VALIDATION_FAILED        - "Validation failed" (fields: title, description, dueDate) UC-09 2a
  400 ASSIGNEE_NOT_MEMBER      - "The assignee must be a household member."              UC-09 3a

## GET /api/households/:householdId/chores
Auth: required, member
Query: status=open | completed (optional; omitted returns both)
Success: 200 { chores: ChorePublic[] }
  open: soonest dueDate first, undated last. completed: newest completedAt first.
Errors:
  400 VALIDATION_FAILED        - "Validation failed" (fields: status)

## PATCH /api/households/:householdId/chores/:choreId
Auth: required, member
Request: any of { title, description, assignedUserId, dueDate }. Send
  assignedUserId: null or dueDate: null to clear it.
Success: 200 { chore: ChorePublic }
Errors:
  400 VALIDATION_FAILED        - "Validation failed"
  400 ASSIGNEE_NOT_MEMBER      - "The assignee must be a household member."
  404 CHORE_NOT_FOUND          - "Chore not found."
  409 CHORE_ALREADY_COMPLETE   - "A completed chore cannot be edited."

Covers "assign chore" and "set due date" from the MVP scope table for chores
that already exist.

## POST /api/households/:householdId/chores/:choreId/complete
Auth: required, member
Request: none
Success: 200 { chore: ChorePublic }   isComplete true, completedAt set
Errors:
  403 CHORE_NOT_ASSIGNED_TO_YOU - "Only the assigned member can complete this chore."    UC-09 9a
  404 CHORE_NOT_FOUND          - "Chore not found."

An unassigned chore can be completed by any member (UC-09 9b). Completing an
already-complete chore returns 200 with the chore unchanged, keeping the
original completedAt (UC-09 8a).

### Dashboard (US-10) - owner: Orlando

## GET /api/households/:householdId/dashboard
Auth: required, member
Success: 200 {
  household: HouseholdPublic,
  members: MemberPublic[],
  balances: { balances: BalancePublic[], totals: { youOweCents, owedToYouCents } },
  upcomingChores: ChorePublic[],        // open chores assigned to the requester, soonest due first
  recentActivity: [                     // newest first, at most 10
    { type: "EXPENSE",         at: string, expense: ExpensePublic }
    | { type: "SETTLEMENT",    at: string, settlement: SettlementPublic }
    | { type: "CHORE_COMPLETED", at: string, chore: ChorePublic }
  ]
}
Errors: common errors only

One request for the whole screen, so the dashboard meets NFR-02 (under two
seconds, five members, 500 expenses) without the client making five calls.
An empty household returns empty arrays; the client shows empty-state
guidance (UC-10 3a-6a).

---

## 5. Error code catalog

| Code | Status | Endpoints |
|---|---|---|
| `INVALID_JSON` | 400 | any |
| `VALIDATION_FAILED` | 400 | any endpoint with a body or query |
| `NO_PARTICIPANTS` | 400 | expenses, preview |
| `PAYER_NOT_MEMBER` | 400 | expenses, preview |
| `PARTICIPANT_NOT_MEMBER` | 400 | expenses, preview |
| `DUPLICATE_PARTICIPANT` | 400 | expenses, preview |
| `SPLIT_SUM_MISMATCH` | 400 | expenses, preview |
| `PERCENT_SUM_INVALID` | 400 | expenses, preview |
| `SAME_MEMBER` | 400 | settlements |
| `MEMBER_NOT_IN_HOUSEHOLD` | 400 | settlements |
| `ASSIGNEE_NOT_MEMBER` | 400 | chores create, chores patch |
| `UNAUTHENTICATED` | 401 | every auth-required endpoint |
| `INVALID_CREDENTIALS` | 401 | login |
| `NOT_HOUSEHOLD_OWNER` | 403 | invitations create |
| `CHORE_NOT_ASSIGNED_TO_YOU` | 403 | chore complete |
| `HOUSEHOLD_NOT_FOUND` | 404 | every household-scoped endpoint |
| `INVITATION_INVALID` | 404 | invitation lookup, accept |
| `EXPENSE_NOT_FOUND` | 404 | expense by id |
| `CHORE_NOT_FOUND` | 404 | chore patch, complete |
| `EMAIL_UNAVAILABLE` | 409 | register |
| `ALREADY_IN_HOUSEHOLD` | 409 | household create, invitation accept |
| `EXCEEDS_BALANCE` | 409 | settlements |
| `CHORE_ALREADY_COMPLETE` | 409 | chore patch |
| `INVITATION_EXPIRED` | 410 | invitation lookup, accept |
| `INTERNAL_ERROR` | 500 | any |

In code, each maps to one error class in `server/src/services/errors.ts`, and
one route-level error handler turns the class into this shape. Routes do not
build error bodies by hand.

---

## 6. Decisions this contract makes

These close the open questions in `docs/use-cases.md`. Both members agree to
them by approving this pull request.

1. **Invitation expiry: 7 days.** (Use cases open question 1.)
2. **Chore completion: assigned member only**, as FR-15 and US-09 literally say.
   An unassigned chore can be completed by anyone. If this proves wrong in use,
   FR-15 is reworded first and the contract second. (Open question 2.)
3. **Remainder rule: extra cents go to participants in request order.**
   Deterministic, so the same input always gives the same shares. The client
   sends participants in household join order so results are stable across
   screens. (Open question 3.)
4. **Percentages: integer basis points.** Settled by PR #31. (Open question 4.)
5. **Non-members get 404, not 403**, so the API does not confirm another
   household exists.
6. **Registration does not log the user in**, following UC-01 step 7.

## 7. Changes existing code needs

- **PR #34 (`POST /api/auth/register`)** returns `{ error: { message, fields } }`
  with no `code`. It needs `code` added: `VALIDATION_FAILED` for 400,
  `EMAIL_UNAVAILABLE` for 409, `INTERNAL_ERROR` for 500. Status codes, messages,
  and the service layer are already correct.
- **`express.json()` parse failures** currently fall through to Express's
  default HTML error page. A JSON error handler in `server/src/middleware/`
  should return `400 INVALID_JSON`.
