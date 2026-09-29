# Component Designs

RoomSync — Software Design and Development
Issue #20 · Milestone 1 deliverable

Component-level designs for two use cases, as the milestone requires. Both
describe code that is merged on `main`, not a proposed design — every module,
function and error code named here exists and is under test.

- **UC-01 Register Account** — the write path, chosen because it exercises
  every layer plus a database constraint.
- **UC-02 Log In** — the read-and-authenticate path, chosen because it is where
  the security-relevant decisions live.

Both follow ADR-001's layering:

    Routes -> Services -> Repositories -> PostgreSQL

with cross-cutting concerns in `middleware/`.

---

## 1. Modules involved

| Module | Layer | Responsibility |
|---|---|---|
| `routes/auth.routes.ts` | Route | HTTP only: read the body, call a service, set status and session |
| `middleware/async-handler.ts` | Middleware | Forwards async rejections to the error handler |
| `middleware/session.ts` | Middleware | Session cookie and PostgreSQL-backed store |
| `middleware/require-auth.ts` | Middleware | Rejects requests with no session |
| `middleware/error-handler.ts` | Middleware | Turns an `AppError` into the contract's error body |
| `services/auth.service.ts` | Service | Business rules: validation, hashing, credential check |
| `services/validation.ts` | Service | Pure field validators |
| `services/errors.ts` | Service | `AppError` subclasses carrying `code` and `status` |
| `repositories/user.repository.ts` | Repository | The only module issuing user queries |
| `repositories/errors.ts` | Repository | Translates Prisma error codes into repository errors |
| `repositories/prisma.ts` | Repository | Lazily constructed Prisma client with the driver adapter |

Two rules make this checkable rather than aspirational:

- Only `repositories/` imports `@prisma/client`.
- Services never see `req` or `res`; routes never see Prisma.

---

## 2. UC-01 — Register Account

### 2.1 Sequence

```
Client          auth.routes      auth.service     validation    user.repository    PostgreSQL
  │                  │                 │               │                │               │
  ├─POST /register──▶│                 │               │                │               │
  │                  ├─register(body)─▶│               │                │               │
  │                  │                 ├─validateName─▶│                │               │
  │                  │                 ├─validateEmail▶│                │               │
  │                  │                 ├─validatePwd──▶│                │               │
  │                  │                 │◀──errors──────┤                │               │
  │                  │                 │                                │               │
  │                  │         [any field invalid]                      │               │
  │                  │◀──ValidationError (400 VALIDATION_FAILED, fields)│               │
  │                  │                 │                                │               │
  │                  │                 ├─normalizeEmail                 │               │
  │                  │                 ├─findByEmail(email)────────────▶│               │
  │                  │                 │                                ├─SELECT───────▶│
  │                  │                 │◀───────────────user | null─────┤◀──────────────┤
  │                  │                 │                                │               │
  │                  │         [email already taken]                    │               │
  │                  │◀──EmailTakenError (409 EMAIL_UNAVAILABLE)────────┤               │
  │                  │                 │                                │               │
  │                  │                 ├─bcrypt.hash(password, 10)      │               │
  │                  │                 ├─create({name,email,hash})─────▶│               │
  │                  │                 │                                ├─INSERT───────▶│
  │                  │                 │                                │◀─P2002 or row─┤
  │                  │                 │◀──UserRecord | UniqueConstraintError────────────┤
  │                  │                 ├─toPublicUser (strips hash)     │               │
  │                  │◀──PublicUser────┤                                │               │
  │◀──201 {user}─────┤                 │                                │               │
```

### 2.2 Design decisions

**All fields are validated before any I/O.** `register` collects every field
error into one map and throws once, so a form shows all three errors at once
rather than one per round trip. Nothing touches the database until validation
passes.

**Email is normalized before both the lookup and the insert.** The unique index
is case-sensitive, so without this `Alex@x.com` and `alex@x.com` become two
accounts. Normalizing on write but not on read would still let the duplicate
through, so there is a test for the lookup path specifically.

**The duplicate check is not a lock.** Two concurrent registrations of the same
address both pass `findByEmail`, and only the unique index catches the second.
`user.repository.create` therefore catches Prisma's `P2002` and throws
`UniqueConstraintError`, which the service converts to `EmailTakenError`. Both
paths produce the same 409 rather than a 500 from one of them.

Note the direction of that translation. The repository throws its *own* error
type; the service maps it to a business error. A repository importing
`EmailTakenError` from `services/` would be calling a layer above it, which
ADR-001 forbids.

**Registration does not create a session** (UC-01 step 7, contract Section 6).
The client calls login immediately after, which keeps the flow to one step
without giving registration a side effect the contract does not describe.

---

## 3. UC-02 — Log In

### 3.1 Sequence

```
Client          auth.routes      auth.service     user.repository   express-session   PostgreSQL
  │                  │                 │                 │                 │              │
  ├─POST /login─────▶│                 │                 │                 │              │
  │                  ├─login(body)────▶│                 │                 │              │
  │                  │                 ├─presence check  │                 │              │
  │                  │◀─ValidationError (400) if missing │                 │              │
  │                  │                 │                 │                 │              │
  │                  │                 ├─normalizeEmail  │                 │              │
  │                  │                 ├─findByEmail────▶│                 │              │
  │                  │                 │                 ├─SELECT─────────────────────────▶│
  │                  │                 │◀──user | null───┤◀───────────────────────────────┤
  │                  │                 │                 │                 │              │
  │                  │                 ├─bcrypt.compare(password,          │              │
  │                  │                 │     user?.passwordHash ?? DUMMY_HASH)            │
  │                  │                 │                 │                 │              │
  │                  │         [no user OR mismatch]     │                 │              │
  │                  │◀─InvalidCredentialsError (401 INVALID_CREDENTIALS)  │              │
  │                  │                 │                 │                 │              │
  │                  │◀──PublicUser────┤                 │                 │              │
  │                  ├─session.regenerate()──────────────────────────────▶│              │
  │                  ├─session.userId = user.id                           │              │
  │                  ├─session.save()────────────────────────────────────▶│              │
  │                  │                 │                 │                 ├─INSERT──────▶│
  │◀─200 {user} + Set-Cookie───────────┤                 │                 │              │
```

### 3.2 The three security decisions

These are the reason UC-02 was chosen for this document. Each is invisible in
the happy path and expensive to retrofit.

**Session regeneration before storing the user id.** `req.session.regenerate()`
issues a new session id at the moment of authentication. Without it, an id
fixed before login — via a planted cookie — carries into the authenticated
session, which is session fixation. Tested by asserting two consecutive logins
produce different ids.

**Equal work on both failure paths.** When no account matches, the service
still runs `bcrypt.compare` against a dummy hash generated at module load.
Returning early instead would make the unknown-email path measurably faster,
and that timing difference discloses which addresses are registered just as
effectively as a different error message would. Tested by asserting the two
responses are byte-identical and that the compare still happens.

**Login does not apply the registration password rules.** It checks presence
only. Rejecting a short password with "must be at least 8 characters" would
tell someone guessing which passwords are worth trying, and would lock out any
account whose password predates a rule change.

### 3.3 Session persistence

Sessions are stored in PostgreSQL through `connect-pg-simple`, not in memory.
The default `MemoryStore` drops every session when the process restarts — which
`tsx watch` does on every file save — and cannot be shared across instances.

The `session` table is declared as a Prisma model so `prisma migrate dev` owns
it. Left unmanaged, every later migration would see an unknown table as drift
and offer to drop it. This is the one permitted exception to the
repositories-only-SQL rule, documented in `server/src/repositories/README.md`.

---

## 4. Error handling, shared by both

Neither route builds an error body. Services throw an `AppError` subclass
carrying its own `code` and `status`; `middleware/error-handler.ts` renders
every one of them into the contract's single shape:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "…", "fields": { … } } }
```

| Error class | Code | Status |
|---|---|---|
| `ValidationError` | `VALIDATION_FAILED` | 400 |
| `EmailTakenError` | `EMAIL_UNAVAILABLE` | 409 |
| `InvalidCredentialsError` | `INVALID_CREDENTIALS` | 401 |
| `UnauthenticatedError` | `UNAUTHENTICATED` | 401 |
| *(unrecognized)* | `INTERNAL_ERROR` | 500 |
| *(malformed JSON body)* | `INVALID_JSON` | 400 |

Two consequences worth naming:

- Every future endpoint gets the correct error shape without writing any error
  code, because the handler is mounted once in `app.ts`.
- An unexpected error never reaches the client. The handler logs it and returns
  a generic message, because a database error can disclose table and column
  names.

`asyncHandler` exists because Express 4 does not catch rejections from an async
handler — the promise rejects, `next` is never called, and the request hangs
until it times out. Express 5 handles this natively, which is one thing to drop
when that upgrade is revisited.

---

## 5. Client components (UC-01 and UC-02)

| Component | Responsibility |
|---|---|
| `lib/api.ts` | Fetch wrapper; turns a non-2xx response into `ApiError` carrying `code` and `fields` |
| `auth/AuthProvider.tsx` | Resolves the session by calling `/auth/me` on mount |
| `auth/RequireAuth.tsx` | Renders a loading state, then the route or a redirect to login |
| `pages/LoginPage.tsx` | Form; maps `VALIDATION_FAILED` to fields, other codes to a form-level message |
| `pages/RegisterPage.tsx` | Form; registers then logs in |
| `components/Field.tsx` | Labelled input wired to its error with `aria-describedby` |

**`status` starts as `loading`, not `anonymous`.** The session cookie is
`httpOnly`, so the client genuinely cannot tell who is signed in until `/me`
answers. Defaulting to anonymous would flash the login screen at signed-in
users on every refresh.

**`INVALID_CREDENTIALS` renders above the form, not under a field.** Attaching
it to the password input would tell a guesser the email was correct, undoing
the server-side work described in §3.2.

**`RequireAuth` is convenience, not access control.** Anyone can edit the
client. What protects household data is `requireAuth` on the server, which
rejects direct API calls too (FR-03).

---

## 6. Traceability

| Requirement | Where it is satisfied |
|---|---|
| FR-01 register | `auth.service.register`, `POST /api/auth/register` |
| FR-02 authenticate | `auth.service.login`, `POST /api/auth/login` |
| FR-03 block unauthenticated access | `middleware/require-auth.ts`, tested against a forged cookie |
| FR-17 persistent storage | `repositories/`, PostgreSQL via Prisma |
| NFR-04 keyboard and WCAG AA | `components/Field.tsx`, focus styles in `index.css` |
| NFR-07 no plaintext passwords | bcrypt in `auth.service`, `toPublicUser` strips the hash |
| SC-01 account access | 29 service tests, 30 route tests |
| SC-09 security | `require-auth` tests, enumeration-resistance tests |
