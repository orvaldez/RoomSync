# Design Patterns

RoomSync — Software Design and Development
Issue #28 · Milestone 1 deliverable

The milestone asks for one or two design patterns with justification. Two are
described here, both **already implemented and merged**, not proposed:

1. **Repository** — isolating data access
2. **Chain of Responsibility** — Express middleware, used for cross-cutting concerns

A third, **Strategy**, is described in §3 as the shape US-06 will take, and is
labelled as planned rather than built.

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

**Services test without a database.** The 29 tests in `auth.service.test.ts`
mock the repository module, so the Prisma client is never loaded. The same will
hold for the splitting arithmetic, which is the logic that most needs
exhaustive testing.

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

By review today, documented in `server/src/repositories/README.md`. From
Milestone 2 a lint rule fails the build when anything outside `repositories/`
imports `@prisma/client`. One documented exception exists —
`connect-pg-simple` manages its own `session` table from the session
middleware — and the lint rule should allowlist that file by name rather than
loosening the rule.

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

## 3. Strategy (planned, US-06)

Included because it is the natural shape for the splitting logic and the
decision is better recorded before the code exists than after.

Three splitting methods — equal, custom, percentage — share a signature and
differ only in how they compute shares:

```
(totalCents, participants, input) -> Share[]
```

The alternative is a conditional inside one function, which would put three
independent algorithms in one body and make the SC-04 rounding tests exercise
all three through the same entry point.

Two things make Strategy worth the indirection here rather than reflexive
pattern use:

- Each method is separately, exhaustively testable — the remainder distribution
  in the equal split and the basis-point arithmetic in the percentage split
  have different edge cases.
- The shared post-condition (shares sum exactly to the total) is asserted once,
  outside the strategies, so it cannot be forgotten in one of them.

`SplitMethod` already exists as an enum in the schema, so the selector is
modelled; only the strategies themselves are unwritten.

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
