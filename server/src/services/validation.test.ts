import { describe, it, expect } from "vitest";
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  validateEmail,
  validateName,
  validatePassword,
} from "./validation";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Alex@Example.COM  ")).toBe("alex@example.com");
  });

  it("makes addresses differing only in case identical", () => {
    expect(normalizeEmail("ALEX@example.com")).toBe(
      normalizeEmail("alex@EXAMPLE.com")
    );
  });
});

describe("validateName", () => {
  it("accepts an ordinary name", () => {
    expect(validateName("Orlando")).toBeNull();
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(validateName("")).not.toBeNull();
    expect(validateName("   ")).not.toBeNull();
  });

  it("rejects a non-string", () => {
    expect(validateName(undefined)).not.toBeNull();
    expect(validateName(42)).not.toBeNull();
    expect(validateName(null)).not.toBeNull();
  });

  it("rejects a name past the length limit", () => {
    expect(validateName("a".repeat(NAME_MAX_LENGTH))).toBeNull();
    expect(validateName("a".repeat(NAME_MAX_LENGTH + 1))).not.toBeNull();
  });
});

describe("validateEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(validateEmail("orlando@crimson.ua.edu")).toBeNull();
    expect(validateEmail("a.b+tag@sub.example.co.uk")).toBeNull();
  });

  it("accepts an address that needs normalizing first", () => {
    expect(validateEmail("  Alex@Example.com ")).toBeNull();
  });

  it("rejects malformed addresses", () => {
    expect(validateEmail("not-an-email")).not.toBeNull();
    expect(validateEmail("missing@domain")).not.toBeNull();
    expect(validateEmail("@example.com")).not.toBeNull();
    expect(validateEmail("spaces in@example.com")).not.toBeNull();
  });

  it("rejects an empty value or a non-string", () => {
    expect(validateEmail("")).not.toBeNull();
    expect(validateEmail(undefined)).not.toBeNull();
  });

  it("rejects an address past the length limit", () => {
    const local = "a".repeat(EMAIL_MAX_LENGTH);
    expect(validateEmail(`${local}@example.com`)).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it("accepts a password at the minimum length", () => {
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it("rejects a password below the minimum length", () => {
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH - 1))).not.toBeNull();
  });

  it("rejects an empty value or a non-string", () => {
    expect(validatePassword("")).not.toBeNull();
    expect(validatePassword(undefined)).not.toBeNull();
  });

  it("accepts a password at exactly the bcrypt byte limit", () => {
    expect(validatePassword("a".repeat(PASSWORD_MAX_BYTES))).toBeNull();
  });

  it("rejects a password past the bcrypt byte limit", () => {
    // Beyond 72 bytes bcrypt ignores the rest, so two different long
    // passwords sharing a prefix would both verify.
    expect(validatePassword("a".repeat(PASSWORD_MAX_BYTES + 1))).not.toBeNull();
  });

  it("measures the bcrypt limit in bytes, not characters", () => {
    // 20 four-byte characters is 80 bytes but only 40 UTF-16 code units, so a
    // character-based check would wrongly let this through.
    const emoji = "😀".repeat(20);
    expect(Buffer.byteLength(emoji, "utf8")).toBeGreaterThan(PASSWORD_MAX_BYTES);
    expect(validatePassword(emoji)).not.toBeNull();
  });
});
