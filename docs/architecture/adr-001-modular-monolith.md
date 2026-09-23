#### ADR-001: Use a Layered Modular Monolith with a Three-Tier Client-Server Architecture

**Status:** Accepted

**Date:** September 22, 2026

**Deciders:** Orlando Rodriguez Valdez, Agustin Lemuz-Juarez

**Issue:** #19

##### Context

*RoomSync* is a one-semester course project built by a two-person team across six two-week sprints. The stack is fixed by the Milestone 0 proposal: React and TypeScript on the client, Node.js, Express, and TypeScript on the server, PostgreSQL through Prisma, and Docker Compose for local setup.

Three things shape the architecture:

- **The core logic is money.** Expense splitting and balance derivation must be exact to the cent (FR-09, FR-18, SC-04). That logic has to be unit-testable on its own, without a database or an HTTP request.
- **Every request must be authorized on the server.** A user may only read or change data for a household they belong to (NFR-06, NFR-07, SC-09). That check has to live in one predictable place so it cannot be forgotten on a new endpoint.
- **A TA must run it on an independent machine** at every milestone using only the README (SC-11, SC-13). Fewer moving parts means fewer ways for that to fail.

We need an architecture that two people can build quickly, that keeps the business rules testable, and that does not add infrastructure the project does not need.

##### Decision

*RoomSync* will use a **three-tier client-server architecture**.

- **Presentation tier:** A React single-page application. It collects input and displays results. It holds no business rules the server relies on.
- **Logic tier:** A single Express server organized as a **layered modular monolith**:
  - **Routes** handle HTTP only: parse the request, call a service, map the result or error to a response. No business logic, no database access.
  - **Services** hold the business rules: split calculation, balance derivation, household authorization, chore state transitions. Services know nothing about HTTP (no `req`, no `res`).
  - **Repositories** are the only modules that import `@prisma/client` or run SQL.
- **Data tier:** A PostgreSQL database, reached only through the repository layer.

The dependency rule is:

    Routes -> Services -> Repositories -> PostgreSQL

A layer may call only the layer directly below it. It may not skip a layer or call a layer above it. Cross-cutting concerns (session loading, authentication guards, JSON error formatting) live in `server/src/middleware/`.

The server is organized by feature inside each layer (for example `auth.service.ts`, `household.service.ts`, `expense.service.ts`), so each feature area from the backlog maps to one file per layer.

The client and server run as separate processes and can be deployed separately. The server remains one application with one database.

##### Alternatives Considered

**Two-layer monolith (routes call Prisma directly)**

- Rejected because business rules would end up inside route handlers.
- Split and balance logic could then only be tested through HTTP with a live database, which makes the SC-04 rounding tests slow and fragile.
- Household authorization would be repeated in every handler instead of enforced in one service call, which is how an endpoint ends up missing it.

**Microservices**

- Rejected because they add deployment, networking, and data-consistency work a two-person team cannot afford in six sprints.
- An expense and its shares must be written in one transaction (UC-05). Splitting expenses and balances into separate services would turn that into a distributed transaction.
- Their scaling benefits are irrelevant for households of two to five members.

**Backend-as-a-service (Firebase or similar)**

- Rejected in the proposal (Section 6) and confirmed here.
- Authorization would move into platform security rules instead of server code the project is meant to demonstrate.
- A reproducible local setup for the TA is harder, and the data model is relational, which suits PostgreSQL better than a document store.

**Server-rendered monolith**

- Rejected because the proposal commits to a React single-page application and a REST API.
- It would also tie the future native mobile client (a listed post-MVP feature) to HTML pages instead of an API.

##### Weighted Decision Matrix

Scores are 1 (poor) to 5 (strong). Weighted score = weight x score, maximum 500.

| Criterion | Weight | Layered monolith | Two-layer monolith | Server-rendered monolith | Microservices | Backend-as-a-service |
|---|---|---|---|---|---|---|
| Simple enough for two people in six sprints | 30 | 4 | 5 | 4 | 1 | 4 |
| Business rules testable in isolation (SC-04, SC-10) | 25 | 5 | 2 | 3 | 4 | 2 |
| Server-side authorization in one place (SC-09) | 20 | 5 | 3 | 5 | 4 | 2 |
| Reproducible local setup for the TA (SC-11) | 15 | 5 | 5 | 5 | 2 | 2 |
| Room to grow after the MVP | 10 | 3 | 2 | 2 | 5 | 3 |
| **Weighted total** | **100** | **450** | **355** | **390** | **290** | **270** |

The layered monolith costs a little simplicity against a two-layer design, and wins back far more on testability and authorization, which are the two criteria where a mistake means wrong balances or leaked household data.

##### Consequences

**Positive**

- The split and balance logic is pure service code, so it is unit-tested with Vitest and no database (SC-04, SC-10).
- Household membership is checked in the service layer on every call, so authorization does not depend on each route remembering it (NFR-07).
- The database starts with `docker compose up` and the server with `npm run dev`, which keeps the TA's setup to a few commands (SC-11).
- Because only repositories touch Prisma, changing the ORM or query strategy changes one layer and nothing above it.
- Both members can work on different features without conflict, since each feature is its own file in each layer.

**Negative**

- More files per feature than a two-layer design. A simple read still passes through a route, a service, and a repository.
- The server is a single deployment. If it crashes, every API feature is unavailable. That is acceptable for a course project and can be revisited if availability ever matters.
- The layering rule is enforced by review, not tooling, until Milestone 2. A route that imports Prisma directly would still compile. The rule is written in `server/src/repositories/README.md` so it is visible where the code lives, and an ESLint import restriction is planned with the CI work.

##### Compliance

- `server/src/repositories/README.md` states the rule where developers will see it.
- Pull request review checks every new import of `@prisma/client` (Definition of Done: "Follows the Routes -> Services -> Repositories layering").
- From Milestone 2, CI runs a lint rule that fails the build if anything outside `repositories/` imports `@prisma/client`.
