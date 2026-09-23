# Use Case Specifications
 
RoomSync — Software Design and Development
Orlando Rodriguez Valdez, Agustin Lemuz-Juarez
Issue #4 · Milestone 1 deliverable
 
Ten use cases, one per P0 user story (US-01 through US-10), expanding the acceptance
criteria in proposal Section 5 into concrete actor-system interactions. US-11 is P1 and
deferred to Sprint 3; its use case will be added when that story is scheduled.
 
---
 
## Actors
 
| Actor | Description |
|---|---|
| **Visitor** | A person without an account, or with an account but no active session. Can register and log in; can accept an invitation only after authenticating. |
| **Member** | An authenticated user belonging to a household. Can record expenses, view balances, record settlements, and manage chores. |
| **Owner** | A Member with the `OWNER` role, held by the user who created the household. Everything a Member can do, plus creating invitations and managing membership. |
| **System** | RoomSync itself — performs calculations, validation, and authorization checks. Not an external actor; listed for readability in the flows. |
 
Every use case from UC-03 onward assumes server-side authorization on every request: the
System verifies the requester is authenticated and belongs to the household owning the
resource (NFR-06, NFR-07, SC-09). Rather than repeating that as a step in ten flows, it
is stated once here and appears in the flows only where failing it is the interesting
case.
 
---
 
## UC-01 — Register Account
 
| | |
|---|---|
| **User story** | US-01 (P0) |
| **Primary actor** | Visitor |
| **Goal** | Create a RoomSync account that can be used to log in |
| **Preconditions** | The visitor is not authenticated |
| **Postconditions** | A user record exists with a securely hashed password; the visitor can now log in |
 
**Main success scenario**
 
1. Visitor opens the registration page.
2. Visitor enters a name, an email address, and a password.
3. System validates that all required fields are present and that the email is
   well-formed.
4. System normalizes the email to lowercase and checks that no account already uses it.
5. System hashes the password with bcrypt using a per-user salt (NFR-07).
6. System creates the user record.
7. System confirms registration and directs the visitor to log in.
**Extensions**
 
- **3a. A required field is missing or the email is malformed.** System redisplays the
  form with a field-level error and does not create an account. Returns to step 2.
- **3b. The password does not meet minimum requirements.** System reports the specific
  requirement that was not met. Returns to step 2.
- **4a. An account already uses that email.** System reports that registration could not
  be completed. The message does not confirm whether the address is registered, since
  that would disclose account existence to an unauthenticated visitor. No account is
  created.
- **6a. The database write fails.** System reports an error and creates nothing. No
  partial user record is left behind.
**Special requirements**
 
- Passwords are never stored or logged in plain text (NFR-07)
- All validation is repeated server-side regardless of client-side checks (NFR-07)
- The form is keyboard-operable with labeled inputs (NFR-04)
---
 
## UC-02 — Log In and Log Out
 
| | |
|---|---|
| **User story** | US-02 (P0) |
| **Primary actor** | Visitor (login), Member (logout) |
| **Goal** | Obtain an authenticated session, and end it on request |
| **Preconditions** | For login: a registered account exists |
| **Postconditions** | A valid session exists and protected routes are accessible; after logout the session is invalidated |
 
**Main success scenario — logging in**

1. Visitor opens the login page.
2. Visitor enters an email and password.
3. System normalizes the email and retrieves the matching user.
4. System verifies the password against the stored hash.
5. System establishes a session.
6. System redirects the visitor, now a Member, to the household dashboard.

**Main success scenario — logging out**

7. Member selects log out.
8. System invalidates the session and clears the session cookie.
9. System redirects the Member to the login page.

**Extensions**

- **3a. No account matches the email.** System reports that the credentials are
  invalid and creates no session. Returns to step 2.
- **4a. The password does not verify.** System reports the same message as 3a, using
  identical wording and comparable response time, so the response does not reveal
  which accounts exist. No session is created. Returns to step 2.
- **6a. The member belongs to no household.** System directs them to the
  create-or-join screen instead of the dashboard (see UC-03, UC-04).
- **9a. A request is made to a protected route without a valid session** — whether
  after logout or without ever logging in. System rejects the request and redirects to
  login. This holds for direct API requests, not only for navigation (FR-03).
---
 
## UC-03 — Create Household
 
| | |
|---|---|
| **User story** | US-03 (P0) |
| **Primary actor** | Member |
| **Goal** | Create a household to manage with roommates |
| **Preconditions** | The member is authenticated and belongs to no household |
| **Postconditions** | A household exists with a unique identifier; the creator is a member of it with the `OWNER` role |
 
**Main success scenario**
 
1. Member selects "create household."
2. Member enters a household name.
3. System validates the name is present.
4. System creates the household with a unique identifier.
5. System creates a membership joining the creator to the household with role `OWNER`
   (FR-05).
6. System displays the household dashboard (UC-10).
**Extensions**
 
- **1a. The member already belongs to a household.** System does not offer creation. The
  MVP supports one active household per user; this is enforced as a service-layer check
  rather than a database constraint, so the post-MVP multiple-households feature does not
  require a migration.
- **3a. The name is empty or only whitespace.** System reports the error; no household is
  created. Returns to step 2.
- **4a. The household write fails.** Steps 4 and 5 run in one transaction, so nothing is
  created and no orphaned household exists.
- **5a. The membership write fails.** The transaction from step 4 rolls back with it, so
  no household is left without an owner.
**Special requirements**
 
- Steps 4 and 5 are atomic. A household with no owner would be unreachable and
  unmanageable.
---
 
## UC-04 — Invite Roommate and Join Household
 
| | |
|---|---|
| **User story** | US-04 (P0) |
| **Primary actor** | Owner (invitation), Visitor or Member (acceptance) |
| **Goal** | Add another user to an existing household |
| **Preconditions** | The owner is authenticated and holds the `OWNER` role in the household |
| **Postconditions** | The recipient is a member of the household with role `MEMBER`; the invitation is marked accepted |
 
This use case spans two actors because US-04's acceptance criteria cover both ends of the
exchange. The invitation flow and the acceptance flow are separated below.
 
**Main success scenario — creating the invitation**
 
1. Owner opens household members and selects "invite roommate."
2. System generates an unguessable invitation token and an expiration time.
3. System creates an invitation record for the household with status `PENDING`.
4. System displays the invitation link for the owner to send through their own messaging
   — RoomSync does not send email in the MVP.
**Main success scenario — accepting the invitation**
 
5. Recipient opens the invitation link.
6. System retrieves the invitation by token and confirms it is `PENDING` and unexpired.
7. If the recipient is not authenticated, System directs them to register or log in
   (UC-01, UC-02) and returns them to the invitation afterward.
8. System displays the household name and asks the recipient to confirm.
9. Recipient accepts.
10. System creates a membership joining the recipient to the household with role `MEMBER`.
11. System marks the invitation `ACCEPTED`.
12. System displays the household dashboard.
**Extensions**
 
- **1a. The requester is a Member without the `OWNER` role.** System rejects the request.
  Enforced server-side, not by hiding the interface control (FR-06, SC-09).
- **6a. No invitation matches the token.** System reports that the invitation is not
  valid. It does not distinguish "never existed" from "already used."
- **6b. The invitation is expired.** System reports it has expired and marks it `EXPIRED`.
  The owner can issue a new one.
- **6c. The invitation was already accepted.** System reports it is no longer valid.
- **9a. The recipient already belongs to a household.** System explains that the MVP
  supports one household per user and does not add the membership.
- **9b. The recipient is already a member of this household.** System takes no action and
  shows the dashboard. The unique constraint on (user, household) prevents a duplicate
  membership.
**Special requirements**
 
- The token is generated with a cryptographically secure random source. A guessable token
  would let an outsider join a household and read its financial data.
- Balances recorded before the join are unaffected. A new member starts at zero with
  every other member, since balances derive from expense shares the new member does not
  appear in (NFR-03).
---
 
## UC-05 — Record Shared Expense
 
| | |
|---|---|
| **User story** | US-05 (P0) |
| **Primary actor** | Member |
| **Goal** | Record an expense the household shares, so balances reflect it |
| **Preconditions** | The member belongs to the household |
| **Postconditions** | An expense exists with shares summing exactly to its total; balances reflect it immediately |
 
**Main success scenario**
 
1. Member selects "add expense."
2. Member enters a description, an amount, and the date the expense occurred.
3. Member identifies who paid, defaulting to themselves.
4. Member selects the participating household members.
5. Member selects a splitting method: equal, custom, or percentage.
6. System calculates each participant's share (UC-06).
7. Member reviews the calculated shares.
8. Member confirms.
9. System validates the expense and its shares.
10. System stores the expense and its shares in a single transaction.
11. System displays the updated balances.
**Extensions**
 
- **2a. The amount is zero, negative, or not a valid number.** System rejects it with a
  field-level error. Returns to step 2.
- **2b. The description is empty.** System rejects it. Returns to step 2.
- **2c. The amount has more than two decimal places.** System rejects it. Amounts are
  converted to integer cents on entry and stored as integers throughout (FR-18).
- **3a. The payer is not a member of the household.** System rejects the expense.
- **4a. No participants are selected.** System rejects it — a split needs at least one
  participant.
- **9a. Shares do not sum to the total.** System rejects the expense and stores nothing.
  This check is unconditional and runs server-side even though the System calculated the
  shares itself, so a malformed client request cannot create an inconsistent expense
  (FR-09).
- **10a. The write fails partway.** The expense and all of its shares are written in one
  transaction. A failure stores neither, so no expense exists with incomplete shares —
  which would silently corrupt every balance derived from it.
**Special requirements**
 
- Recording a typical expense takes no more than four interactions from the dashboard
  (NFR-01)
- Monetary values are integer cents from entry through storage (FR-18)
---
 
## UC-06 — Split Expense
 
| | |
|---|---|
| **User story** | US-06 (P0) |
| **Primary actor** | Member |
| **Goal** | Divide an expense so each participant's responsibility is exact |
| **Preconditions** | A total amount in cents and at least one participant are given |
| **Postconditions** | Each participant has a share in whole cents; the shares sum exactly to the total |
 
Included by UC-05 rather than invoked on its own. Separated here because it holds the
project's most failure-prone logic — SC-04 requires shares to sum exactly to the total
including any rounding remainder, and the risk register identifies rounding error as a
high-impact data risk.
 
Three splitting methods share this use case. Because their steps are numbered
independently, each step carries its method's letter — **E** for equal, **C** for
custom, **P** for percentage — and each extension is numbered against the step it
branches from.

**Main success scenario — equal split**

- **E1.** System divides the total in cents by the participant count using integer
  division.
- **E2.** System computes the remainder.
- **E3.** System distributes the remainder one cent at a time to participants in
  request order, so the shares sum exactly to the total.
- **E4.** System returns the shares.

For example, $100.00 across three participants is 10000 cents ÷ 3 = 3333 cents each with
a remainder of 1. One participant is assigned 3334. The shares sum to 10000, not 9999.

**Main success scenario — custom split**

- **C1.** Member enters an explicit amount for each participant.
- **C2.** System converts each to integer cents.
- **C3.** System verifies the amounts sum exactly to the total.
- **C4.** System returns the shares.

**Main success scenario — percentage split**

- **P1.** Member enters a percentage for each participant.
- **P2.** System converts each to integer basis points, where 100% is 10000.
- **P3.** System verifies the basis points sum to exactly 10000.
- **P4.** System computes each share as `total_cents × basis_points ÷ 10000` using
  integer arithmetic.
- **P5.** System distributes any rounding remainder as in E3.
- **P6.** System returns the shares.

**Extensions**

- **E1a. The participant list is empty.** System rejects the split rather than dividing
  by zero. This also violates the precondition, so it should not be reachable from
  UC-05, but the check is unconditional.
- **C2a. A converted amount is negative.** System rejects the split.
- **C3a. The amounts do not sum to the total.** System reports the difference and
  rejects the split. It does not silently adjust a participant's amount.
- **P1a. A percentage is negative.** System rejects the split.
- **P3a. The percentages do not sum to 100.** System reports the discrepancy and rejects
  the split.
**Special requirements**
 
- All arithmetic is integer. No floating-point type appears anywhere in the money path
  (FR-18).
- Remainder distribution is deterministic, so the same inputs always produce the same
  shares and the behavior is unit-testable (SC-10).
- Percentages are stored as basis points rather than decimals, so the percentage path is
  integer end to end. Settled by PR #31 and recorded in the API contract, Section 6.
---
 
## UC-07 — View Balances
 
| | |
|---|---|
| **User story** | US-07 (P0) |
| **Primary actor** | Member |
| **Goal** | See what the member owes and what is owed to them |
| **Preconditions** | The member belongs to the household |
| **Postconditions** | Balances shown reflect every recorded expense and settlement at the time of the request |
 
**Main success scenario**
 
1. Member opens balances.
2. System derives the pairwise balance with each other member from the stored expense
   shares and settlements (NFR-03).
3. System presents each balance, distinguishing amounts the member owes from amounts owed
   to them.
4. Member reads the result.
**Extensions**
 
- **2a. The member has no expenses or settlements.** System shows a zero balance rather
  than an empty view.
- **1a. The member requests balances for a household they do not belong to.** System
  rejects the request. Enforced server-side on every request, not by omitting navigation
  (NFR-06, SC-09).
**Special requirements**
 
- Balances are never stored or cached as a running total. They are computed from expense
  shares and settlements on each request, so they cannot drift from the underlying
  records (NFR-03).
- Retrieval completes in under two seconds for a household of five with 500 expenses
  (NFR-02).
---
 
## UC-08 — Record Settlement
 
| | |
|---|---|
| **User story** | US-08 (P0) |
| **Primary actor** | Member |
| **Goal** | Record that a debt was paid outside the application, so balances reflect it |
| **Preconditions** | An outstanding balance exists between the two members |
| **Postconditions** | A settlement is recorded and the balance between the two members is reduced by that amount |
 
**Main success scenario**
 
1. Member opens balances and selects "record payment" against an outstanding balance.
2. System displays the two members and the outstanding amount.
3. Member enters the amount paid, defaulting to the full outstanding balance, and an
   optional note.
4. System validates the amount.
5. System records the settlement.
6. System displays the updated balance.
**Extensions**
 
- **4a. The amount exceeds the outstanding balance.** System rejects it and reports the
  outstanding amount. Recording more than is owed would invert the balance and imply a
  debt that does not exist.
- **4b. The amount is zero or negative.** System rejects it.
- **4c. The payer and recipient are the same member.** System rejects it.
- **4d. Either member does not belong to this household.** System rejects it.
- **4e. The outstanding balance changed between display and submission** — a concurrent
  expense or settlement. The amount is re-validated against the balance at the moment of
  writing, not against the balance the member was shown, so a settlement can never exceed
  what is actually owed.
**Special requirements**
 
- RoomSync does not transfer money. This records that a payment happened elsewhere.
- Settlements remain visible in history after the balance reaches zero (FR-12, US-11).
---
 
## UC-09 — Manage Chores
 
| | |
|---|---|
| **User story** | US-09 (P0) |
| **Primary actor** | Member |
| **Goal** | Create, assign, and complete household chores |
| **Preconditions** | The member belongs to the household |
| **Postconditions** | The chore exists with its assignment and due date; completed chores are distinguishable from outstanding ones |
 
**Main success scenario — creating a chore**
 
1. Member selects "add chore."
2. Member enters a title and an optional description.
3. Member optionally assigns the chore to a household member.
4. Member optionally sets a due date.
5. System validates the input.
6. System creates the chore as not complete.
7. System displays it in the chore list.
**Main success scenario — completing a chore**
 
8. The assigned member opens the chore list and marks the chore complete.
9. System verifies the requester is the assigned member (FR-15).
10. System records the completion and its timestamp.
11. System moves the chore from outstanding to completed.
**Extensions**
 
- **2a. The title is empty.** System rejects it. Returns to step 2.
- **3a. The assignee is not a member of the household.** System rejects the assignment.
- **4a. The due date is in the past.** System accepts it — a member may be recording a
  chore that was already overdue — but the interface marks it overdue.
- **8a. The chore is already complete.** System takes no action rather than overwriting
  the original completion time.
- **9a. The requester is not the assigned member.** System rejects the completion. FR-15
  and US-09 both scope completion to the assigned user, and the API contract Section 6
  confirms that reading (`CHORE_NOT_ASSIGNED_TO_YOU`, 403).
- **9b. The chore has no assignee.** Any household member may complete it; there is no
  assigned user to restrict it to.
**Special requirements**
 
- Completion stores a timestamp, not only a flag. UC-10's recent-activity view and US-11's
  history both need to order completions in time.
---
 
## UC-10 — View Household Dashboard
 
| | |
|---|---|
| **User story** | US-10 (P0) |
| **Primary actor** | Member |
| **Goal** | Understand household responsibilities at a glance, in one place |
| **Preconditions** | The member belongs to a household |
| **Postconditions** | The member sees current members, their own balances, their upcoming chores, and recent household activity |
 
**Main success scenario**
 
1. Member logs in, or navigates to the dashboard.
2. System confirms household membership.
3. System retrieves current household members.
4. System derives the member's outstanding balances (UC-07).
5. System retrieves chores assigned to the member that are not complete, ordered by due
   date.
6. System retrieves recent household activity — recent expenses, recent settlements, and
   recently completed chores.
7. System presents all of it on one screen, with navigation to expenses and chores.
**Extensions**
 
- **1a. The member is not authenticated.** System redirects to login (UC-02).
- **2a. The member belongs to no household.** System shows the create-or-join screen
  instead (UC-03, UC-04).
- **4a. The member has no balances.** System shows a zero balance rather than an empty
  panel.
- **5a. The member has no chores assigned.** System shows empty-state guidance naming
  the next action rather than a blank panel.
- **6a. The household has no recorded activity.** System shows empty-state guidance, so
  a new household has a visible next step rather than three blank panels.
**Special requirements**
 
- Loads in under two seconds for a household of five with 500 recorded expenses (NFR-02)
- Fully usable at a viewport width of 375 pixels (NFR-05)
- Keyboard-operable, meeting WCAG AA contrast (NFR-04)
- Marcus Lee, the second persona, is the target reader: the dashboard must answer "what do
  I owe and what am I supposed to do" without any setup on his part
---
 
## Traceability
 
| Use case | User story | Functional requirements | Success criteria |
|---|---|---|---|
| UC-01 Register Account | US-01 | FR-01 | SC-01 |
| UC-02 Log In and Log Out | US-02 | FR-02, FR-03 | SC-01, SC-09 |
| UC-03 Create Household | US-03 | FR-04, FR-05 | SC-02 |
| UC-04 Invite and Join | US-04 | FR-04, FR-06 | SC-02, SC-09 |
| UC-05 Record Shared Expense | US-05 | FR-07, FR-09, FR-18 | SC-03 |
| UC-06 Split Expense | US-06 | FR-08, FR-09, FR-10, FR-18 | SC-04 |
| UC-07 View Balances | US-07 | FR-10, FR-12 | SC-05, SC-09 |
| UC-08 Record Settlement | US-08 | FR-11, FR-12 | SC-06 |
| UC-09 Manage Chores | US-09 | FR-13, FR-14, FR-15 | SC-07 |
| UC-10 View Dashboard | US-10 | FR-16 | SC-08 |
 
FR-17 (persistent database storage), NFR-06 and NFR-07 (server-side authorization on every
request) underpin all ten and are not listed per-row.
 
---
 
## Resolved questions

These four points were open when this document was drafted. All four are now settled in
the API contract, `docs/design/api-contract.md`, Section 6, which is the authority if the
two ever disagree.

1. **Invitation expiry: 7 days.** Long enough for a roommate to act on it, short enough
   that a leaked link does not stay live all semester. UC-04 step 2 and extension 6b.
2. **Chore completion: the assigned member only**, as FR-15 and US-09 literally say. An
   unassigned chore may be completed by anyone. The restriction means a chore cannot be
   closed while its assignee is away; if that proves wrong in use, FR-15 is reworded
   first and the contract second. UC-09 steps 8-9 and extensions 9a, 9b.
3. **Remainder rule: extra cents go to participants in request order.** Deterministic, so
   the same input always produces the same shares and the SC-10 tests can encode it. The
   client sends participants in household join order, so results are stable across
   screens. UC-06 step E3.
4. **Percentages: integer basis points.** Settled by PR #31, now merged. UC-06 steps
   P2-P4.
