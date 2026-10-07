# Repositories

Repositories are the ONLY modules permitted to import from `@prisma/client`
or execute raw SQL. Routes and services must not import Prisma directly.

This is ADR-001's layered architecture made into an explicit, checkable rule.
`npm run lint` enforces it: outside this directory, importing `@prisma/client`
or `pg` fails the lint, and CI runs the lint on every pull request
(`server/eslint.config.mjs`, `docs/architecture/layering-lint.md`).

    Routes -> Services -> Repositories -> PostgreSQL

A layer may not skip a layer, and may not call a higher layer.

## Exception: the session store

`server/src/middleware/session.ts` configures `connect-pg-simple`, which opens
its own `pg` connection pool and runs SQL against the `session` table — reads
and writes on every authenticated request, plus an hourly sweep of expired
rows. That is SQL executed outside `repositories/`, from a pool Prisma does not
manage.

This is a deliberate exception, not a violation. ADR-001 places session loading
among the cross-cutting concerns that live in `middleware/`, and the rule above
exists to keep *application data access* in one layer so business rules stay
testable and the ORM stays swappable. A library managing its own storage is
neither: nothing in the application reads or writes the `session` table, no
business rule depends on its shape, and the only code that knows it exists is
the middleware that configures the library.

Two things keep the exception contained:

- The `Session` model is declared in `schema.prisma`, so Prisma owns the
  migration and the table is not invisible to the schema. Without it, every
  later `prisma migrate dev` would see an unmanaged table as drift and offer to
  drop it.
- Nothing outside `middleware/session.ts` touches the session store. Reading
  session data in a service or route means reading `req.session`, which
  express-session populates — not querying the table.

Any *other* module that wants to run SQL still belongs in `repositories/`. The
lint rule permits `connect-pg-simple` in `middleware/session.ts` by name rather
than loosening the rule generally, and nowhere else. The integration test setup
(`src/integration/`) may also import `pg`, to create and empty the test
database; it still may not import Prisma.
