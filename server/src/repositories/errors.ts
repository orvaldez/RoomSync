/**
 * Errors the repository layer raises.
 *
 * These describe what the database refused, not what it means for the
 * application. Translating them into a business error is the service layer's
 * job — a repository importing from `services/` would be calling a layer above
 * it, which ADR-001 forbids.
 */

/**
 * A write violated a unique index. `field` is the model field that collided,
 * as the schema names it.
 */
export class UniqueConstraintError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`Unique constraint violated on ${field}`);
    this.name = "UniqueConstraintError";
    this.field = field;
  }
}

/**
 * Prisma reports a unique constraint violation as code P2002. Checked
 * structurally rather than with `instanceof PrismaClientKnownRequestError` so
 * this does not depend on the generated client's class identity, which differs
 * between the query engine and the driver adapter paths.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
