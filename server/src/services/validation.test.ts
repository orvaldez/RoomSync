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
  HOUSEHOLD_NAME_MAX_LENGTH,
  validateHouseholdName,
  MAX_AMOUNT_CENTS,
  validateAmountCents,
  EXPENSE_DESCRIPTION_MAX_LENGTH,
  validateExpenseDescription,
  validateCalendarDate,
  CHORE_TITLE_MAX_LENGTH,
  CHORE_DESCRIPTION_MAX_LENGTH,
  validateChoreTitle,
  validateChoreDescription,
  SETTLEMENT_NOTE_MAX_LENGTH,
  validateSettlementNote,
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

describe("validateHouseholdName", () => {
  it("accepts an ordinary household name", () => {
    expect(validateHouseholdName("Apartment 4B")).toBeNull();
  });

  it("rejects an empty value, whitespace, or a non-string", () => {
    expect(validateHouseholdName("")).not.toBeNull();
    expect(validateHouseholdName("   ")).not.toBeNull();
    expect(validateHouseholdName(undefined)).not.toBeNull();
    expect(validateHouseholdName(42)).not.toBeNull();
  });

  it("measures length after trimming", () => {
    const name = "a".repeat(HOUSEHOLD_NAME_MAX_LENGTH);
    expect(validateHouseholdName(`  ${name}  `)).toBeNull();
  });

  it("accepts a name at exactly the limit", () => {
    expect(
      validateHouseholdName("a".repeat(HOUSEHOLD_NAME_MAX_LENGTH))
    ).toBeNull();
  });

  it("rejects a name past the limit", () => {
    expect(
      validateHouseholdName("a".repeat(HOUSEHOLD_NAME_MAX_LENGTH + 1))
    ).not.toBeNull();
  });
});

describe("validateAmountCents", () => {
  it("accepts a positive whole number of cents", () => {
    expect(validateAmountCents(1)).toBeNull();
    expect(validateAmountCents(1234)).toBeNull();
    expect(validateAmountCents(MAX_AMOUNT_CENTS)).toBeNull();
  });

  it("rejects zero and negative amounts", () => {
    expect(validateAmountCents(0)).not.toBeNull();
    expect(validateAmountCents(-1)).not.toBeNull();
  });

  it("rejects fractions of a cent rather than rounding them", () => {
    expect(validateAmountCents(12.34)).not.toBeNull();
    expect(validateAmountCents(0.5)).not.toBeNull();
  });

  it("rejects non-numbers, including numeric strings", () => {
    expect(validateAmountCents("1234")).not.toBeNull();
    expect(validateAmountCents(undefined)).not.toBeNull();
    expect(validateAmountCents(null)).not.toBeNull();
    expect(validateAmountCents(NaN)).not.toBeNull();
    expect(validateAmountCents(Infinity)).not.toBeNull();
  });

  it("rejects an amount the database column cannot hold", () => {
    expect(validateAmountCents(MAX_AMOUNT_CENTS + 1)).not.toBeNull();
  });
});

describe("validateExpenseDescription", () => {
  it("accepts an ordinary description", () => {
    expect(validateExpenseDescription("Groceries")).toBeNull();
  });

  it("rejects an empty, blank, or non-string description", () => {
    expect(validateExpenseDescription("")).not.toBeNull();
    expect(validateExpenseDescription("   ")).not.toBeNull();
    expect(validateExpenseDescription(undefined)).not.toBeNull();
    expect(validateExpenseDescription(42)).not.toBeNull();
  });

  it("rejects a description past the length limit", () => {
    const max = EXPENSE_DESCRIPTION_MAX_LENGTH;
    expect(validateExpenseDescription("a".repeat(max))).toBeNull();
    expect(validateExpenseDescription("a".repeat(max + 1))).not.toBeNull();
  });
});

describe("validateCalendarDate", () => {
  it("accepts a real YYYY-MM-DD date, including a leap day", () => {
    expect(validateCalendarDate("2026-09-29")).toBeNull();
    expect(validateCalendarDate("2028-02-29")).toBeNull();
  });

  it("rejects other formats", () => {
    expect(validateCalendarDate("09/29/2026")).not.toBeNull();
    expect(validateCalendarDate("2026-9-29")).not.toBeNull();
    expect(validateCalendarDate("2026-09-29T00:00:00.000Z")).not.toBeNull();
    expect(validateCalendarDate(undefined)).not.toBeNull();
  });

  it("rejects dates that match the pattern but do not exist", () => {
    expect(validateCalendarDate("2026-02-30")).not.toBeNull();
    expect(validateCalendarDate("2027-02-29")).not.toBeNull();
    expect(validateCalendarDate("2026-13-01")).not.toBeNull();
  });
});

describe("validateChoreTitle", () => {
  it("accepts a title up to the limit", () => {
    expect(validateChoreTitle("Take out bins")).toBeNull();
    expect(validateChoreTitle("a".repeat(CHORE_TITLE_MAX_LENGTH))).toBeNull();
  });

  it("rejects empty, blank, non-string and over-long titles", () => {
    expect(validateChoreTitle("")).not.toBeNull();
    expect(validateChoreTitle("   ")).not.toBeNull();
    expect(validateChoreTitle(undefined)).not.toBeNull();
    expect(validateChoreTitle("a".repeat(CHORE_TITLE_MAX_LENGTH + 1))).not.toBeNull();
  });
});

describe("validateChoreDescription", () => {
  it("treats absent, null and blank as no description", () => {
    expect(validateChoreDescription(undefined)).toBeNull();
    expect(validateChoreDescription(null)).toBeNull();
    expect(validateChoreDescription("  ")).toBeNull();
  });

  it("rejects non-strings and descriptions past the limit", () => {
    expect(validateChoreDescription(5)).not.toBeNull();
    expect(validateChoreDescription("a".repeat(CHORE_DESCRIPTION_MAX_LENGTH))).toBeNull();
    expect(
      validateChoreDescription("a".repeat(CHORE_DESCRIPTION_MAX_LENGTH + 1))
    ).not.toBeNull();
  });
});

describe("validateSettlementNote", () => {
  it("treats absent, null and blank as no note", () => {
    expect(validateSettlementNote(undefined)).toBeNull();
    expect(validateSettlementNote(null)).toBeNull();
    expect(validateSettlementNote("   ")).toBeNull();
  });

  it("rejects non-strings and notes past the limit", () => {
    expect(validateSettlementNote(42)).not.toBeNull();
    expect(validateSettlementNote("a".repeat(SETTLEMENT_NOTE_MAX_LENGTH))).toBeNull();
    expect(validateSettlementNote("a".repeat(SETTLEMENT_NOTE_MAX_LENGTH + 1))).not.toBeNull();
  });
});
