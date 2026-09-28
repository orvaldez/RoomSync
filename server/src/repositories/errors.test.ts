import { describe, it, expect } from "vitest";
import { UniqueConstraintError, isUniqueViolation } from "./errors";

describe("isUniqueViolation", () => {
  it("recognizes Prisma's unique constraint code", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
  });

  it("recognizes it on a real Error carrying the code", () => {
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    expect(isUniqueViolation(error)).toBe(true);
  });

  it("rejects other Prisma error codes", () => {
    // P2025 is "record not found" — a different failure that must not be
    // reported to the user as a duplicate email.
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation({ code: "P1001" })).toBe(false);
  });

  it("rejects ordinary errors and non-objects", () => {
    expect(isUniqueViolation(new Error("connection terminated"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("P2002")).toBe(false);
  });
});

describe("UniqueConstraintError", () => {
  it("carries the field that collided", () => {
    const error = new UniqueConstraintError("email");

    expect(error.field).toBe("email");
    expect(error.name).toBe("UniqueConstraintError");
    expect(error).toBeInstanceOf(Error);
  });
});
