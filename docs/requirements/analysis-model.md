# Analysis Model

RoomSync — Software Design and Development
Issue #17 · Milestone 1 deliverable

The important data and behaviour in the system. Entities and relationships here
match `server/prisma/schema.prisma` on `main`; behaviours match the services
that implement them, or name the rule an unbuilt service will have to enforce.

---

## 1. Domain entities

Eight entities plus one infrastructure table. RoomSync is built around a
**standing household** rather than a trip, which is the decision that shapes
most of this model: balances carry forward across a lease instead of resetting,
so nothing is ever archived or closed out.

| Entity | What it represents | Lifetime |
|---|---|---|
| **User** | A person with an account | Permanent |
| **Household** | A shared living arrangement | Permanent |
| **Membership** | A user's participation in a household, with a role | From join until removal (post-MVP) |
| **Invitation** | A time-limited offer to join a household | Expires after 7 days |
| **Expense** | Money one member spent on the household's behalf | Permanent, immutable in the MVP |
| **ExpenseShare** | One participant's portion of one expense | Tied to its expense |
| **Settlement** | A record that money changed hands outside the app | Permanent |
| **Chore** | A household task, optionally assigned and dated | Permanent |
| *Session* | Login state, owned by `connect-pg-simple` | Expires after 14 days |

`Session` is listed for completeness but is not a domain concept — no business
rule reads it, and the only module aware of it is the session middleware.

---

## 2. Relationships

```
        ┌──────┐                             ┌───────────┐
        │ User │◀────────┐          ┌───────▶│ Household │
        └──┬───┘         │          │        └─────┬─────┘
           │         ┌───┴──────────┴──┐           │
           │         │   Membership    │           │
           │         │  role, joinedAt │           │
           │         └─────────────────┘           │
           │                                       ├──▶ Invitation
           │                                       │    token, status, expiresAt
           │                                       │
           │         ┌─────────┐                   │
           ├────────▶│ Expense │◀──────────────────┤
           │ paidBy  │ cents   │                   │
           │         └────┬────┘                   │
           │              │ 1..*                   │
           │         ┌────▼─────────┐              │
           ├────────▶│ ExpenseShare │              │
           │         │ amountOwed   │              │
           │         └──────────────┘              │
           │                                       │
           │         ┌────────────┐                │
           ├────────▶│ Settlement │◀───────────────┤
           │ from/to │ amountCents│                │
           │         └────────────┘                │
           │                                       │
           │         ┌───────┐                     │
           └────────▶│ Chore │◀────────────────────┘
          assignee   └───────┘
```

Every entity except `User` belongs to exactly one `Household`. That is what
makes household scoping enforceable in one place: any query for household data
filters on `household_id`, and `Membership` is the only thing that grants
access to it.

**Cardinalities**

| Relationship | Cardinality | Enforced by |
|---|---|---|
| User ↔ Household | many-to-many through Membership | `@@unique([userId, householdId])` |
| Household → Invitation | one-to-many | FK, cascade on delete |
| Household → Expense | one-to-many | FK, cascade on delete |
| Expense → ExpenseShare | one-to-many, at least one | FK cascade; the "at least one" is a service rule |
| User → Expense (payer) | one-to-many | FK, `onDelete: Restrict` |
| User → ExpenseShare | one-to-many | FK, `onDelete: Restrict` |
| Settlement → User (from, to) | two separate one-to-many | FK, `onDelete: Restrict` |
| Chore → User (assignee) | optional one-to-many | FK, `onDelete: SetNull` |

The delete behaviours encode a judgement: a user who appears in financial
history cannot be deleted (`Restrict`), because removing them would silently
change everyone's balance. A chore outliving its assignee is harmless, so that
one is `SetNull`.

---

## 3. Two modelling decisions worth stating

### 3.1 There is no Balance entity

Balances are **derived at read time** from `ExpenseShare` and `Settlement`
(NFR-03). A stored running total is a second source of truth that drifts the
first time a write fails halfway, and reconciling it afterwards is guesswork.

The balance between two members is:

```
net(A, B) = Σ shares B owes on expenses A paid
          − Σ shares A owes on expenses B paid
          − Σ settlements B paid A
          + Σ settlements A paid B
```

Positive means B owes A. This is computed per request, which is why NFR-02
bounds the dashboard at two seconds for 500 expenses, and why the schema
carries composite indexes on `(household_id, …)` for every table the sum reads.

### 3.2 All money is integer cents

Every monetary field is an `Int` of cents and its name ends in `Cents`
(FR-18). No `Float`, no `Decimal`, anywhere in the money path — including
percentages, which are stored as integer basis points where 100% is `10000`.

This exists because SC-04 requires shares to sum **exactly** to the total.
Floating-point arithmetic cannot promise that: `0.1 + 0.2 !== 0.3`. Integer
arithmetic can, provided the remainder is distributed rather than rounded away.

---

## 4. Key behaviours

### 4.1 Splitting an expense (UC-06)

The most failure-prone behaviour in the system, and the reason §3.2 exists.

**Equal split.** Integer division, then distribute the remainder one cent at a
time to participants in request order. $100.00 across three is 3333, 3333,
3334 — summing to 10000, not 9999.

**Custom split.** Amounts are given; the service verifies they sum exactly to
the total and rejects the expense otherwise. It never silently adjusts a
participant's amount to make the arithmetic work.

**Percentage split.** Percentages convert to basis points, which must sum to
exactly 10000. Each share is `total × basisPoints ÷ 10000` in integer
arithmetic, with the remainder distributed as above.

The remainder rule is fixed as *request order* rather than left open, because
the unit tests encode whichever rule is chosen, and a non-deterministic rule
cannot be tested at all.

### 4.2 Recording a settlement (UC-08)

A settlement records that money moved **outside** the application — RoomSync
transfers nothing. It reduces the derived balance between two members rather
than modifying any expense.

The amount is re-validated against the balance at the moment of writing, not
against the balance the member was shown. Between display and submission a
concurrent expense can change it, and a settlement that exceeds what is owed
would invert the balance and imply a debt that does not exist.

### 4.3 Authorization (NFR-06, NFR-07, SC-09)

Two checks, in order, on every household-scoped request:

1. **Authenticated?** `requireAuth` middleware, or `401 UNAUTHENTICATED`.
2. **A member of *this* household?** A service-layer check, or
   `404 HOUSEHOLD_NOT_FOUND` — deliberately the same response as a household
   that does not exist, so the API never confirms another household exists.

Both run server-side on every request. Hiding a link in the client is not
access control; the client is editable and the API is directly callable.

---

## 5. Invariants

Rules that must hold no matter which code path runs. The schema enforces some;
the rest are service-layer checks, marked as such because a reader should know
which ones a malformed request could violate if a service forgot them.

| Invariant | Enforced by |
|---|---|
| Email is unique | Unique index (case-normalized before write) |
| A user joins a household at most once | `@@unique([userId, householdId])` |
| A household always has an owner | Household + OWNER membership created in one transaction |
| Expense shares sum exactly to the total | Service (SC-04) |
| Percentage shares sum to exactly 10000 basis points | Service |
| No share is negative | Service |
| A settlement does not exceed the outstanding balance | Service (US-08) |
| A settlement's payer and recipient differ | Service |
| Both settlement parties belong to the household | Service |
| Passwords are never stored in plain text | Service (bcrypt, NFR-07) |
| One active household per user in the MVP | Service, deliberately not a DB constraint |

The last one is deliberate: a `@@unique` on `Membership.userId` would enforce
it today but would make the post-MVP multiple-households feature a migration
rather than a code change.

---

## 6. State

Only two entities have meaningful state. Everything else is created and read.

**Invitation**

```
PENDING ──accepted──▶ ACCEPTED
   │
   ├──7 days elapse──▶ EXPIRED
   │
   └──owner revokes──▶ REVOKED
```

Only `PENDING` is actionable. The other three are terminal, and all three
produce the same response to the recipient — the API does not distinguish a
revoked invitation from one that never existed.

**Chore**

```
outstanding ──assignee marks complete──▶ complete (completedAt set)
```

One-way in the MVP. Completion stores a timestamp rather than only a flag,
because the dashboard's recent activity and US-11's history both need to order
completions in time.

---

## 7. What this model does not yet cover

Stated plainly, because a model that quietly omits things is worse than one
that names its gaps:

- **Expense editing and deletion** are out of scope for the MVP. Expenses are
  immutable once recorded, which is why no `updatedAt` exists on them.
- **Member removal** is post-MVP. The `Restrict` delete rules above mean it
  will need a deliberate decision about what happens to that member's history.
- **Recurring expenses and chores** are post-MVP; nothing in the schema
  anticipates them.
- **Multi-household users** are modelled but blocked by a service check, as
  §5 notes.

---

## 8. Traceability

| Requirement | Modelled by |
|---|---|
| FR-04, FR-05, FR-06 | Household, Membership, `MembershipRole` |
| FR-07, FR-08, FR-09, FR-10 | Expense, ExpenseShare, §4.1 |
| FR-11, FR-12 | Settlement, §4.2 |
| FR-13, FR-14, FR-15 | Chore, §6 |
| FR-18 | §3.2 |
| NFR-03 | §3.1 |
| NFR-06, NFR-07 | §4.3 |
| SC-04 | §3.2, §4.1 |
| SC-09 | §4.3 |
