# Design Patterns

RoomSync — Software Design and Development
Issue #28 · Milestone 1 deliverable

The milestone asks for one or two design patterns with justification. The two
are the ones `design-classes.md` §4 names, both **implemented and merged**:

1. **Repository** (§1): isolating data access
2. **Strategy** (§3): the three expense-splitting methods

A third, **Chain of Responsibility** (§2), is recorded as well because the
Express middleware is built on it and it carries the authorization guarantee,
but it comes with the framework rather than being a design choice of ours.

| Pattern | Files | What it buys | What it costs |
|---|---|---|---|
| Repository | `server/src/repositories/*.repository.ts` | Business rules testable without a database; one place for Prisma | More files per feature |
| Chain of Responsibility | `server/src/app.ts`, `server/src/middleware/` | Auth, membership and error shape applied once, not per route | Order is load-bearing and invisible |
| Strategy | `server/src/services/split.service.ts` | Each split method tested alone; the sums-to-total rule enforced once for all | An indirection where a `switch` would also work |

---

## 1. Repository

### The problem

Business rules that call the ORM directly are testable only against a live
database. For RoomSync that is not a stylistic complaint: SC-04 requires
expense splitting to be exact to the cent, and SC-10 requires automated tests
covering it. Rounding tests that need a running PostgreSQL are slow enough that
they get run less often, and they fail for reasons unrelated to arithmetic.

Data access scattered through route handlers also has no single place to
enforce household scoping, which is how an endpoint ends up missing the check
(SC-09).

### The implementation

`server/src/repositories/` holds the only modules that import
`@prisma/client`. Everything above them depends on the repository's own
contract:

```ts
// repositories/user.repository.ts
export type UserRecord = {
  id: string; name: string; email: string;
  passwordHash: string; createdAt: Date;
};

export async function findByEmail(email: string): Promise<UserRecord | null>
export async function create(user: NewUser): Promise<UserRecord>
```

`UserRecord` is declared here rather than re-exported from the generated Prisma
client. That is the detail that makes the pattern real: services depend on a
type this project owns, so swapping the ORM changes this layer and nothing
above it.

### What it buys, concretely

**Services test without a database.** Every `*.service.test.ts` mocks the
repository modules, so the Prisma client is never loaded: the 29 tests in
`auth.service.test.ts`, and likewise for expenses, balances, settlements and
chores. The splitting arithmetic needs no mocking at all, because the Strategy
in §3 is pure.

**Errors translate at the boundary.** `user.repository.create` catches Prisma's
`P2002` unique-violation code and throws `UniqueConstraintError`. The service
converts that to `EmailTakenError`. A Prisma error code never reaches a
service, and — note the direction — the repository throws its own type rather
than importing a service error, because importing upward would violate the
layering the pattern exists to protect.

### The cost

More files per feature. A simple read passes through a route, a service, and a
repository, three files to change instead of one. Accepted deliberately in
ADR-001: the alternative puts household authorization in every handler, which
is exactly the kind of repetition that eventually gets skipped once.

### Enforcement

By tooling, documented in `server/src/repositories/README.md`. Since #69, the
server lint fails the build when anything outside `repositories/` imports
`@prisma/client` or `pg` (`docs/architecture/layering-lint.md`). One
documented exception exists — `connect-pg-simple` manages its own `session`
table from the session middleware — and the lint rule allows that one file by
name rather than loosening the rule.

---

## 2. Chain of Responsibility (Express middleware)

### The problem

Several concerns apply to many requests but belong to none of them: parsing
JSON, loading the session, rejecting unauthenticated callers, and turning an
error into the contract's response shape. Implementing any of these per-route
means every new endpoint must remember to do it, and one that forgets fails
silently — an unauthenticated request succeeding is not a visible bug until
someone reads another household's data.

### The implementation

Each middleware handles what it recognizes and passes everything else along:

```ts
// app.ts — order is the design
app.use(express.json());              // parse, or hand a SyntaxError onward
app.use(buildSessionMiddleware());    // populate req.session
app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use(errorHandler);                // last: renders anything thrown above
```

And on individual routes:

```ts
router.get("/auth/me", requireAuth, asyncHandler(handler));
```

`requireAuth` either calls `next()` or calls `next(new UnauthenticatedError())`,
which skips every remaining handler and lands in `errorHandler`.

### What it buys, concretely

**Every endpoint gets the right error shape for free.** `errorHandler` is
mounted once. It renders any `AppError` subclass into
`{ error: { code, message } }`, so no route builds an error body by hand and no
future endpoint can drift from the contract.

**Authorization is one word per route.** Adding `requireAuth` to a route is the
whole implementation. The paired `currentUserId(req)` throws if called without
the guard, so forgetting to mount it fails loudly in development rather than
treating the request as anonymous.

**Unexpected errors never leak.** The handler logs the real error and returns a
generic 500, because a database error message can disclose table and column
names.

### The cost

Order is load-bearing and invisible. `errorHandler` placed before the routes
silently never runs; `express.json()` after them means no route sees a body.
Neither mistake produces an error message that points at the ordering. This is
mitigated only by the comments in `app.ts` saying why each line is where it is.

Express 4 also does not catch rejections from async handlers — the promise
rejects, `next` is never called, and the request hangs until timeout. Hence
`asyncHandler`, which is a workaround for that gap rather than part of the
pattern; Express 5 makes it unnecessary.

---

## 3. Strategy (expense splitting, US-06)

### The problem

An expense can be split three ways: equally, by custom amounts, or by
percentage (FR-08). Each has its own edge cases. An equal split has remainder
cents to hand out ($100.00 across three is 3333, 3333, 3334). A custom split
must sum exactly to the total. A percentage split works in basis points, which
must sum to exactly 10000 and round to whole cents. One rule applies to all
three: the shares must add up to the total exactly (FR-09, SC-04), because a
share that is off by a cent is wrong in every balance derived from it.

One function with a branch per method would put three algorithms in one body,
and the shared rule would have to be remembered in each branch.

### The implementation

`server/src/services/split.service.ts`. The three methods are interchangeable
functions behind one signature, chosen by the request's `splitMethod`:

```ts
type SplitStrategy = (totalCents: number, participants: SplitParticipant[]) => Share[];

const strategies: Record<SplitMethod, SplitStrategy> = {
  EQUAL: splitEqually,
  CUSTOM: splitByAmount,
  PERCENTAGE: splitByPercentage,
};

export function splitExpense(input: SplitInput): Share[] {
  // ...checks common to every method: fields, at least one participant, no duplicates
  const shares = strategies[splitMethod](totalAmountCents, participants);
  assertSharesMatchTotal(shares, totalAmountCents);
  return shares;
}
```

`SplitMethod` is the schema's enum, so the `Record` type makes the compiler
reject a method with no strategy. The selector, the strategies and the
post-condition are the same three parts `design-classes.md` §4.2 shows.

### What it buys, concretely

**Each method is tested on its own.** `split.service.test.ts` has 41 tests in
one `describe` block per method plus one for the shared rules, covering the
remainder order, mismatched custom sums, 0% participants, and basis-point
rounding. Being pure (no I/O), they run without a database or mocks.

**The shared rule cannot be forgotten.** `assertSharesMatchTotal` runs after
whichever strategy ran, outside all three. A bug in one strategy fails the
request with a 500 rather than storing an expense whose shares drift from its
total.

**One split, everywhere.** `expense.service` calls `splitExpense` for both
the preview and the save, and the seed (`server/src/seed.ts`) calls it too, so
the preview a member sees, the shares stored, and the demonstration data all
come from the same arithmetic.

**Extending it is local.** A fourth method (by shares, say) is one function and
one entry in `strategies`; nothing else in `splitExpense` changes.

### The cost

An indirection where a `switch` over three cases would also work, and one
more name (`SplitStrategy`) for a reader to learn. It is worth it here because
of the post-condition: keeping it outside the algorithms is what guarantees it
applies to every one of them.

---

## 4. Patterns deliberately not used

Worth recording, since the absence is a decision:

**Active Record.** Prisma supports entity-centric access. Rejected for the same
reason Repository was chosen: it puts persistence on the domain object and
makes business rules untestable without a database.

**Unit of Work.** Prisma's `$transaction` already gives atomic multi-write
operations — creating a household with its OWNER membership, or an expense with
its shares. A separate Unit of Work abstraction over it would add indirection
for no capability.

**Observer / event bus.** Tempting for "recalculate balances when an expense
changes," but balances are derived at read time (NFR-03), so there is nothing
to invalidate. Adding events would create the stale-state problem that
deriving balances exists to avoid.
