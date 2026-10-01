# Component Designs

RoomSync — Software Design and Development
Issue #20 · Milestone 1 deliverable

Component-level designs for two use cases, traced through every layer from
the browser to PostgreSQL:

- **UC-05 Record Shared Expense** (with UC-06 Split Expense) — the write with
  the most rules in the system, and the one SC-04's exact-to-the-cent
  requirement rests on.
- **UC-08 Record Settlement** — the write whose correctness depends on what
  other requests are doing at the same moment.

Both follow ADR-001's layering, with cross-cutting concerns in `middleware/`:

    Client → Routes → Services → Repositories → PostgreSQL

The diagrams name the real modules and functions. Both are on `main`:
Create Expense from #47 and #50, Record Settlement and the ledger lock both
flows take from #54. The module layout itself is in
[module-structure.md](./module-structure.md).

---

## 1. Shared request path

Every household-scoped request passes through the same middleware chain before
its route runs. It is drawn once here and abbreviated as **guards** in the two
diagrams below.

```mermaid
sequenceDiagram
    autonumber
    participant C as Client (lib/api.ts)
    participant S as session
    participant A as requireAuth
    participant M as requireHouseholdMember
    participant HS as household.service
    participant HR as household.repository
    participant DB as PostgreSQL

    C->>S: POST /api/households/:householdId/... (session cookie)
    S->>DB: load session by id
    DB-->>S: session { userId }
    S->>A: req.session populated
    alt no session
        A-->>C: 401 UNAUTHENTICATED
    end
    A->>M: next()
    M->>HS: requireMembership(userId, householdId)
    HS->>HR: findRole(userId, householdId)
    HR->>DB: SELECT role FROM memberships WHERE user_id, household_id
    DB-->>HR: role or no row
    alt not a member, or no such household
        HS-->>C: 404 HOUSEHOLD_NOT_FOUND (identical either way)
    end
    HS-->>M: role
    M->>M: res.locals.membership = { householdId, role }
    Note over M: the route reads the verified household via currentMembership(res), never from the body
```

Errors from any step are thrown as an `AppError` subclass and rendered by
`error-handler`, the last middleware, into the contract's single shape:
`{ "error": { "code", "message", "fields"? } }`. No route or service builds an
error body itself.

---

## 2. UC-05 — Record Shared Expense

`POST /api/households/:householdId/expenses`, preceded by previews from
`POST /api/households/:householdId/expenses/preview` while the form is filled in.

### 2.1 Components

| Component | Layer | Role in this use case |
|---|---|---|
| `pages/AddExpensePage.tsx` | Client | The form; checks fields before sending; shows the preview |
| `lib/money.ts` | Client | "12.34" → 1234 cents, from the digits, never through a float (FR-18) |
| `lib/api.ts` | Client | `previewExpense`, `createExpense`; turns error responses into `ApiError` |
| `routes/expense.routes.ts` | Route | Picks the six body fields; calls the service; sets 200 or 201 |
| `services/expense.service.ts` | Service | `checkExpense`: field validation, membership of payer and participants, then the split |
| `services/split.service.ts` | Service | `splitExpense`: the Strategy per split method, then the sum check |
| `services/validation.ts` | Service | `validateExpenseDescription`, `validateCalendarDate`, `validateAmountCents` |
| `repositories/household.repository.ts` | Repository | `listMembers`: who may pay and participate, with names for the response |
| `repositories/expense.repository.ts` | Repository | `createWithShares`: the expense and its shares in one transaction |

### 2.2 Sequence

```mermaid
sequenceDiagram
    autonumber
    actor U as Member
    participant P as AddExpensePage
    participant API as lib/api.ts
    participant R as expense.routes
    participant ES as expense.service
    participant SS as split.service
    participant HR as household.repository
    participant ER as expense.repository
    participant DB as PostgreSQL

    U->>P: Add expense, then enter description and amount
    Note over P: defaults: today, payer = you, everyone, Equal (NFR-01)

    loop as the form changes (debounced 300 ms)
        P->>P: parseDollarsToCents(amount)
        P->>API: previewExpense(householdId, body)
        API->>R: POST /expenses/preview (guards, section 1)
        R->>ES: previewExpense(householdId, body)
        ES->>ES: checkExpense (same as below)
        ES-->>R: shares with names
        R-->>API: 200 { shares }
        API-->>P: shares
        P-->>U: Each person's share, Total ✓ adds up
    end

    U->>P: Save expense
    P->>P: buildDraft: description, amount, date, participants, share inputs
    alt a field is invalid on the client
        P-->>U: message under each invalid field, nothing sent
    end
    P->>API: createExpense(householdId, body)
    API->>R: POST /api/households/:householdId/expenses (guards, section 1)
    R->>ES: createExpense(householdId, body)

    ES->>ES: validateExpenseDescription, validateCalendarDate
    ES->>SS: splitFieldErrors(totalAmountCents, splitMethod, participants)
    SS-->>ES: field errors, if any
    alt any field invalid (UC-05 2a-2c)
        ES-->>API: 400 VALIDATION_FAILED, every invalid field at once
    end

    ES->>HR: listMembers(householdId)
    HR->>DB: SELECT memberships JOIN users (name only)
    DB-->>HR: members
    HR-->>ES: members
    alt payer not a member (UC-05 3a)
        ES-->>API: 400 PAYER_NOT_MEMBER
    else a participant not a member
        ES-->>API: 400 PARTICIPANT_NOT_MEMBER
    end

    ES->>SS: splitExpense(input)
    SS->>SS: NO_PARTICIPANTS, DUPLICATE_PARTICIPANT checks
    SS->>SS: strategies[splitMethod] (Equal / Custom / Percentage)
    SS->>SS: assertSharesMatchTotal: shares sum exactly to the total
    alt custom amounts do not add up (UC-06 C3a)
        SS-->>API: 400 SPLIT_SUM_MISMATCH
    else percentages do not sum to 100 (UC-06 P3a)
        SS-->>API: 400 PERCENT_SUM_INVALID
    end
    SS-->>ES: shares, e.g. 3334 / 3333 / 3333

    ES->>ER: createWithShares(expense, shares)
    ER->>DB: BEGIN
    Note over ER,DB: lockLedger takes pg_advisory_xact_lock for this household
    ER->>DB: INSERT expenses, INSERT expense_shares (one per participant)
    ER->>DB: COMMIT, or ROLLBACK and store nothing (UC-05 10a)
    DB-->>ER: expense with payer and share names
    ER-->>ES: ExpenseRecord
    ES->>ES: toPublicExpense: expenseDate as YYYY-MM-DD
    ES-->>R: PublicExpense
    R-->>API: 201 { expense }
    API-->>P: expense
    P-->>U: back to the dashboard: Saved "Groceries" for $100.00
```

Every `alt` branch returns before anything below it runs: an expense that fails
any check reaches neither `splitExpense` nor the database.

### 2.3 Design decisions

**The split is calculated only on the server.** The preview endpoint runs the
exact checks that create runs — both call `checkExpense` — and writes nothing.
So what the member reviews (UC-05 step 7) is what gets stored, and the
splitting rules exist in one place.

**Checks run cheapest and most specific first.** Field errors are collected and
reported together before any database read, so a form shows every mistake at
once. Membership costs one query, which also supplies the names the response
needs. Only an expense that passes both reaches the split.

**The sum check is unconditional** (UC-05 9a). `assertSharesMatchTotal` runs
after whichever strategy was used, even though the server calculated the shares
itself. If it ever fails, that is a bug in a strategy, so it is a 500 that
stores nothing — not a 400 blaming the member.

**One transaction for the expense and its shares** (UC-05 10a). An expense with
only some of its shares would silently corrupt every balance derived from it.

**Money stays integer from keyboard to column.** The client converts dollars to
cents from the digits; every server value is an integer number of cents; the
columns are `INTEGER`. No float appears anywhere in the path (FR-18).

---

## 3. UC-08 — Record Settlement

`POST /api/households/:householdId/settlements`, from the Balances page.

### 3.1 Components

| Component | Layer | Role in this use case |
|---|---|---|
| `pages/BalancesPage.tsx` | Client | Each balance with Record payment; the form; reloads balances after a write |
| `lib/balances.ts` | Client | `paymentFor`: who pays whom, and the full outstanding amount as the default |
| `lib/api.ts` | Client | `createSettlement`, `balances`, `settlements` |
| `routes/balance.routes.ts` | Route | Picks the four body fields; calls the service; sets 201 |
| `services/settlement.service.ts` | Service | Validation, same-member and membership checks; the balance rule passed into the write |
| `services/balance.service.ts` | Service | `netOwed`: how much one member owes another, from the ledger rows |
| `repositories/household.repository.ts` | Repository | `findRole` for each party |
| `repositories/ledger.repository.ts` | Repository | `createSettlementChecked`: lock, read, check, insert in one transaction |

### 3.2 Sequence

```mermaid
sequenceDiagram
    autonumber
    actor U as Member
    participant P as BalancesPage
    participant API as lib/api.ts
    participant R as balance.routes
    participant SV as settlement.service
    participant BS as balance.service
    participant HR as household.repository
    participant LR as ledger.repository
    participant DB as PostgreSQL

    U->>P: Record payment on "Maya owes you $33.33"
    P->>P: paymentFor(balance): from Maya, to you, default 33.33
    U->>P: amount, optional note, Record payment
    P->>P: parseDollarsToCents, compare with the balance shown
    alt over the amount shown
        P-->>U: The most you can record is $33.33, nothing sent
    end
    P->>API: createSettlement(householdId, { fromUserId, toUserId, amountCents, note })
    API->>R: POST /api/households/:householdId/settlements (guards, section 1)
    R->>SV: createSettlement(householdId, body)

    SV->>SV: validateAmountCents, validateSettlementNote
    alt amount zero, negative or not whole cents, or note too long (UC-08 4b)
        SV-->>API: 400 VALIDATION_FAILED
    end
    alt from and to are the same member (UC-08 4c)
        SV-->>API: 400 SAME_MEMBER
    end
    par both parties
        SV->>HR: findRole(fromUserId, householdId)
    and
        SV->>HR: findRole(toUserId, householdId)
    end
    HR->>DB: SELECT role FROM memberships (x2)
    DB-->>HR: roles
    alt either is not a member (UC-08 4d)
        SV-->>API: 400 MEMBER_NOT_IN_HOUSEHOLD
    end

    SV->>LR: createSettlementChecked(settlement, check)
    LR->>DB: BEGIN
    LR->>DB: SELECT pg_advisory_xact_lock(41, hashtext(householdId))
    Note over LR,DB: other settlements and expenses in this household wait here
    LR->>DB: SELECT expense_shares JOIN expenses involving the payer
    LR->>DB: SELECT settlements involving the payer
    DB-->>LR: debts and payments as committed right now
    LR->>SV: check(entries)
    SV->>BS: netOwed(toUserId, fromUserId, entries)
    BS-->>SV: owed in cents, e.g. 3333
    alt amountCents greater than owed (UC-08 4a, 4e)
        SV-->>LR: throw ExceedsBalanceError
        LR->>DB: ROLLBACK, nothing stored
        LR-->>API: 409 EXCEEDS_BALANCE
    else within the balance
        LR->>DB: INSERT settlements
        LR->>DB: COMMIT, lock released
        DB-->>LR: settlement with both names
        LR-->>SV: SettlementRecord
        SV-->>R: PublicSettlement
        R-->>API: 201 { settlement }
    end

    API-->>P: settlement, or ApiError EXCEEDS_BALANCE
    P->>API: balances(householdId), settlements(householdId)
    Note over P,API: balances are re-derived by the server, never adjusted on the client (NFR-03)
    API-->>P: fresh balances and history
    P-->>U: "Maya owes you $23.33" and "Maya paid you $10.00" in history
```

On `EXCEEDS_BALANCE` the page takes the same reload path, and shows "Nothing was
recorded… the balance has changed" above the balance, which now reflects the
payment that got there first.

### 3.3 Design decisions

**The balance is checked at the moment of writing, not when it was displayed**
(UC-08 4e). The page's number can be stale — another tab may have recorded a
payment, or someone added an expense. The service passes its rule into the
repository as `check`, and the repository runs it inside the transaction,
after the lock, against the rows as they are then.

**A per-household advisory lock serialises ledger writes.** Without it, two
payments that each fit could both pass their check before either commits, and
together exceed the debt. With it, the second waits, then reads the first and
is refused: five simultaneous $10 payments against a $33.33 debt give exactly
three successes and two `EXCEEDS_BALANCE`. Expense creation takes the same lock,
because a new expense can change the same balance. It is transaction-scoped, so
it is released at commit or rollback and cannot be left held.

**Read committed, not serializable.** A serializable snapshot is taken before
the lock is granted, so it would read the ledger as it was before the
transaction it waited for — and under load it failed with raw `40001` errors
instead of a 409. The lock provides the ordering; read committed lets each
statement see what the previous holder committed.

**The rule stays in the service.** `netOwed` is a pure function in
`balance.service`; the repository only knows "run this check inside the
transaction". No business rule moves into the data layer, and no repository
calls a service.

**Settlements are records, never adjustments.** Recording one changes no
expense and stores no balance; it adds a row that `netOwed` subtracts. The row
stays after the balance reaches zero, which is why the history still shows it
(FR-12).

---

## 4. Consistency with the API contract

Every endpoint, status and code in the diagrams, checked against
`docs/design/api-contract.md` Sections 3-5.

### Create Expense

| Contract | In the design |
|---|---|
| `POST /api/households/:householdId/expenses/preview`, 200 `{ shares }`, writes nothing | §2.2 loop; same `checkExpense`, no repository write |
| `POST /api/households/:householdId/expenses`, 201 `{ expense: ExpensePublic }` | §2.2 final steps; `toPublicExpense` |
| Auth: required, member | Guards, §1 |
| 400 `VALIDATION_FAILED` with fields description, totalAmountCents, expenseDate, splitMethod, participants | `checkExpense` + `splitFieldErrors` |
| 400 `NO_PARTICIPANTS`, `DUPLICATE_PARTICIPANT` | `splitExpense` |
| 400 `PAYER_NOT_MEMBER`, `PARTICIPANT_NOT_MEMBER` | After `listMembers` |
| 400 `SPLIT_SUM_MISMATCH`, `PERCENT_SUM_INVALID` | Custom and Percentage strategies |
| Shares sum exactly to the total, checked unconditionally | `assertSharesMatchTotal` |
| Expense and all shares in one transaction | `createWithShares` |
| Money as integer cents; dates as `YYYY-MM-DD` | `lib/money.ts`; `toPublicExpense` |

### Record Settlement

| Contract | In the design |
|---|---|
| `POST /api/households/:householdId/settlements`, body `{ fromUserId, toUserId, amountCents, note? }`, 201 `{ settlement: SettlementPublic }` | §3.2 |
| Auth: required, member | Guards, §1 |
| 400 `VALIDATION_FAILED` with fields amountCents, note | `validateAmountCents`, `validateSettlementNote` |
| 400 `SAME_MEMBER` | Before any query |
| 400 `MEMBER_NOT_IN_HOUSEHOLD` | After `findRole` for both parties |
| 409 `EXCEEDS_BALANCE`; balance recomputed at write time inside the same transaction; any amount refused if `from` owes `to` nothing | `createSettlementChecked` with `netOwed` |
| Balances derived, never stored (NFR-03) | The page refetches `GET /balances` after every write |
| Settlements stay listed after the balance reaches zero | `GET /settlements` returns every row |
