# Services

Services hold the business rules: split calculation, balance derivation,
household authorization, chore state transitions.

Services may call repositories. Services must not touch Prisma directly and
must not know about HTTP (no `req`, no `res`).
