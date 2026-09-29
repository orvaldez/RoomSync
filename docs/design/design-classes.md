# Design Classes and Module Boundaries

RoomSync — Software Design and Development
Issue #18 · Milestone 1 deliverable

The modules the server is built from, what each one exposes, and the rules
governing which may call which.

Everything below is merged on `main`. Where a module is planned rather than
built, it says so.

---

## 1. Module boundary diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT (React)                                                      │
│   pages/ ──▶ auth/ ──▶ lib/api.ts                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP, /api, session cookie
┌──────────────────────────────▼──────────────────────────────────────┐
│ SERVER                                                              │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ middleware/        cross-cutting, mounted in app.ts            │  │
│  │   session · require-auth · error-handler · async-handler       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                               │                                     │
│  ┌────────────────────────────▼──────────────────────────────────┐  │
│  │ routes/            HTTP boundary — req/res live only here      │  │
│  │   auth.routes · household.routes · health.routes               │  │
│  └────────────────────────────┬──────────────────────────────────┘  │
│                               │ plain values                        │
│  ┌────────────────────────────▼──────────────────────────────────┐  │
│  │ services/          business rules — no req, no res, no Prisma  │  │
│  │   auth.service · household.service · validation · errors       │  │
│  └────────────────────────────┬──────────────────────────────────┘  │
│                               │ repository contracts                │
│  ┌────────────────────────────▼──────────────────────────────────┐  │
│  │ repositories/      the ONLY modules importing @prisma/client   │  │
│  │   user.repository · household.repository · prisma · errors     │  │
│  └────────────────────────────┬──────────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────────┘
                                │ SQL
                        ┌───────▼────────┐
                        │  PostgreSQL 16 │
                        └────────────────┘
```

**The rule (ADR-001):** a layer may call only the layer directly beneath it. It
may not skip a layer, and may not call a layer above it.

Two consequences that are checkable rather than stylistic:

- `grep -r "@prisma/client" server/src --include="*.ts"` should return hits only
  under `repositories/`.
- `grep -rn "req\.\|res\." server/src/services` should return nothing.

One documented exception: `middleware/session.ts` configures
`connect-pg-simple`, which runs its own SQL against the `session` table. The
reasoning is in `server/src/repositories/README.md`; the short version is that
a library managing its own storage is not application data access.

---

## 2. Design classes

TypeScript modules rather than classes, except where state or identity calls
for one. Each module below is a cohesive unit with a single responsibility.

### 2.1 Services

**`auth.service`** — registration, login, current-user lookup.

| Export | Signature | Notes |
|---|---|---|
| `PublicUser` | `{ id, name, email, createdAt }` | Never carries `passwordHash` |
| `register` | `(RegisterInput) => Promise<PublicUser>` | Validates, hashes, creates |
| `login` | `(LoginInput) => Promise<PublicUser>` | Verifies; does not create the session |
| `findCurrentUser` | `(userId) => Promise<PublicUser \| null>` | Null for a deleted account |

`login` returning a user rather than establishing a session is the boundary
working: sessions are an HTTP concern, so the route does that part.

**`household.service`** — creation and lookup.

| Export | Signature | Notes |
|---|---|---|
| `PublicHousehold` | `{ id, name, createdAt, role }` | `role` is the requester's |
| `createHousehold` | `(CreateHouseholdInput) => Promise<PublicHousehold>` | Enforces one household per user |
| `getCurrentHousehold` | `(userId) => Promise<PublicHousehold \| null>` | Null is a normal answer |

**`validation`** — pure functions, no I/O, exhaustively testable.

`normalizeEmail`, `validateName`, `validateEmail`, `validatePassword`,
`validateHouseholdName`, plus the limits as named constants
(`PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_BYTES`, `EMAIL_MAX_LENGTH`,
`NAME_MAX_LENGTH`). Each validator returns a message or `null` rather than
throwing, so a caller can collect every field error and report them together.

**`services/errors`** — the one place a `code` and `status` are attached.

```
AppError (abstract)
  ├── code: string      from the contract's catalog
  ├── status: number
  └── details(): Record<string, unknown> | undefined
        │
        ├── ValidationError          VALIDATION_FAILED    400  (+ fields)
        ├── EmailTakenError          EMAIL_UNAVAILABLE    409
        ├── InvalidCredentialsError  INVALID_CREDENTIALS  401
        ├── UnauthenticatedError     UNAUTHENTICATED      401
        └── AlreadyInHouseholdError  ALREADY_IN_HOUSEHOLD 409
```

This is the one place inheritance earns its keep. `error-handler` needs exactly
two things from any error — a code and a status — and the abstract base is what
lets it render every subclass, including ones not yet written, without a
`switch`.

### 2.2 Repositories

**`user.repository`** — `UserRecord`, `NewUser`, `findByEmail`, `findById`,
`create`.

**`household.repository`** — `MembershipRole`, `HouseholdRecord`,
`HouseholdWithRole`, `NewHousehold`, `createWithOwner`, `findCurrentForUser`,
`hasMembership`.

`createWithOwner` runs both writes in one transaction. A household without a
membership row would be unreachable — nobody could list it, invite to it, or
delete it — so a partial write is worse than none.

**`prisma`** — `getPrisma()`, built on first use rather than at import, so a
module that imports a route does not require a database. `repositories/errors`
holds `UniqueConstraintError` and `isUniqueViolation`, which translate Prisma's
`P2002` into something the service layer understands.

**The detail that makes these repositories rather than a thin wrapper:**
`UserRecord`, `HouseholdRecord` and `MembershipRole` are declared here, not
re-exported from the generated Prisma client. Services depend on types this
project owns. Swapping the ORM changes this layer and nothing above it.

### 2.3 Middleware

| Module | Responsibility |
|---|---|
| `session` | Cookie configuration and the PostgreSQL-backed store; exports `isBehindTlsProxy` so the `secure` cookie and `trust proxy` cannot drift apart |
| `require-auth` | `requireAuth` guard, plus `currentUserId(req)` which throws if the guard is missing |
| `error-handler` | The only place an error becomes a response body |
| `async-handler` | Forwards async rejections to the error handler (Express 4 does not) |

### 2.4 Routes

`auth.routes` (register, login, logout, me), `household.routes` (create,
current), `health.routes`. Each handler reads the body, calls a service, sets a
status. No route builds an error body; no route touches Prisma.

### 2.5 Client

| Module | Responsibility |
|---|---|
| `lib/api.ts` | All HTTP; turns a non-2xx into `ApiError` carrying `code`, `status`, `fields` |
| `auth/context.ts` | The context object, alone, so the provider file exports only components |
| `auth/AuthProvider.tsx` | Session state; asks `/auth/me` on mount |
| `auth/useAuth.ts` | Accessor; throws outside the provider |
| `auth/RequireAuth.tsx` | Route guard — convenience, not access control |
| `components/Field.tsx` | Labelled input wired to its error via `aria-describedby` |
| `components/AppShell.tsx` | Header, current user, logout |
| `pages/*` | One screen each |

`lib/api.ts` is the client's equivalent of the repository layer: the only
module that knows the API exists. A page never calls `fetch`.

---

## 3. Dependency rules, stated as tests

| Rule | How to check |
|---|---|
| Only repositories import Prisma | `grep -r "@prisma/client" server/src --include="*.ts"` → only `repositories/` |
| Services never see HTTP | `grep -rn "req\.\|res\." server/src/services` → nothing |
| Routes never import Prisma | `grep -rn "@prisma/client" server/src/routes` → nothing |
| No layer calls upward | Repositories import no `services/`; services import no `routes/` |
| Pages never call fetch directly | `grep -rn "fetch(" client/src/pages` → nothing |

These become a CI lint rule at Milestone 2. Until then they are review items,
which is why they are written as commands rather than prose.

---

## 4. Why modules rather than classes

The codebase uses exported functions over classes almost everywhere. That is a
decision, not an accident:

- **Services are stateless.** `register(input)` depends only on its argument.
  A class would exist only to hold methods.
- **Module mocking is simpler than dependency injection.** The tests call
  `vi.mock("../repositories/user.repository")` and the real module never loads.
  With constructor injection every test would build a container.
- **Tree-shaking works on functions.** Relevant for `lib/api.ts` on the client.

Classes are used where there is genuine identity or inheritance:
`AppError` and its subclasses, because `instanceof` is the dispatch mechanism
in `error-handler`, and `UniqueConstraintError` for the same reason.

---

## 5. Extension points

Where the next stories attach, so the shape is set before they are written:

| Story | New modules | Existing modules touched |
|---|---|---|
| US-04 invitations | `invitation.repository`, `invitation.service`, `invitation.routes` | `services/errors` (+3 codes) |
| US-05/06 expenses | `expense.repository`, `expense.service`, `split.service`, `expense.routes` | `services/errors` |
| US-07 balances | `balance.service` | Reads via `expense.repository` |
| US-08 settlements | `settlement.repository`, `settlement.service` | — |
| US-09 chores | `chore.repository`, `chore.service`, `chore.routes` | — |

Each adds one file per layer and mounts its router in `app.ts`. Nothing above
`services/` changes, and no existing module is modified except `errors.ts`,
which grows by one class per new error code.

`split.service` is kept separate from `expense.service` deliberately: the
splitting arithmetic is the most failure-prone logic in the system (SC-04), and
isolating it means the rounding tests exercise it directly rather than through
expense creation.

---

## 6. Known boundary weaknesses

Stated because a design document that only lists strengths is not useful:

**Enforcement is human.** Every rule in §3 is a review item until the
Milestone 2 lint rule exists. A route importing Prisma compiles today.

**`services/errors.ts` is a shared file every feature edits.** Each new story
adds a class to it, so it is the most likely merge conflict between two people
working in parallel — as already happened once between the auth and household
branches. Splitting it per feature would trade that for a harder-to-find error
catalog; the trade is worth revisiting if the conflicts recur.

**`validation.ts` mixes domains.** It holds user field validators and
`validateHouseholdName`. At two domains this is fine; at six it becomes a file
nobody owns. The natural split is per-feature validators with shared primitives,
and the right moment is when a third domain arrives.

**The client has no service layer.** Pages call `lib/api.ts` directly. Adequate
while pages are thin; once a screen needs data from several endpoints, a hook
layer between them is the missing piece.