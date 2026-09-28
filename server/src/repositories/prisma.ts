import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires a driver adapter; `new PrismaClient()` with no adapter
// throws at construction. See the v7 upgrade guide.
//
// This module and the repositories beside it are the only places permitted to
// import from `@prisma/client` (ADR-001). Services and routes must go through
// a repository.

// `tsx watch` re-imports this module on every file change. Without a cached
// instance each reload opens a new connection pool and the dev database runs
// out of connections after a dozen saves.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Built on first use rather than at import time. Importing a route must not
 * require a database: tests that mock the repository, and CI steps that only
 * typecheck or lint, would otherwise fail for want of a DATABASE_URL that
 * nothing was going to connect with.
 */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy server/.env.example to server/.env, " +
        "and start the database with `docker compose up -d` from the repo root."
    );
  }

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}
