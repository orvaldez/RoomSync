# Repositories

Repositories are the ONLY modules permitted to import from `@prisma/client`
or execute raw SQL. Routes and services must not import Prisma directly.

This is ADR-001's layered architecture made into an explicit, checkable rule.
Automated enforcement arrives with the CI work in Milestone 2 and 3.

    Routes -> Services -> Repositories -> PostgreSQL

A layer may not skip a layer, and may not call a higher layer.
