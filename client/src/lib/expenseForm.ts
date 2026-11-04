import type { Expense, SplitMethod } from "./api";

/**
 * Turning a stored expense back into what the expense form holds, for the
 * edit screen (US-12). The form works in what a person types ("12.34",
 * "33.33"), so cents and basis points go back to those strings exactly:
 * saving an edit without touching anything must store the same expense.
 */

/** 1234 -> "12.34", 5 -> "0.05", 1000 -> "10.00". The inverse of parseDollarsToCents. */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** 3333 -> "33.33", 5000 -> "50", 1250 -> "12.5". The inverse of parsePercentToBasisPoints. */
export function basisPointsToInput(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const fraction = basisPoints % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

export type ExpenseFormValues = {
  description: string;
  amount: string;
  expenseDate: string;
  paidByUserId: string;
  /** The participants still in the household, in the order they were stored. */
  selected: string[];
  splitMethod: SplitMethod;
  customAmounts: Record<string, string>;
  percents: Record<string, string>;
};

/**
 * The form's starting values for editing `expense`. Only current members are
 * selected: the form can't offer someone who has left (US-13).
 */
export function formValuesFromExpense(
  expense: Expense,
  memberIds: readonly string[]
): ExpenseFormValues {
  const current = new Set(memberIds);
  const shares = expense.shares.filter((share) => current.has(share.userId));

  return {
    description: expense.description,
    amount: centsToInput(expense.totalAmountCents),
    expenseDate: expense.expenseDate,
    paidByUserId: expense.paidBy.userId,
    selected: shares.map((share) => share.userId),
    splitMethod: expense.splitMethod,
    customAmounts:
      expense.splitMethod === "CUSTOM"
        ? Object.fromEntries(
            shares.map((share) => [share.userId, centsToInput(share.amountOwedCents)])
          )
        : {},
    percents:
      expense.splitMethod === "PERCENTAGE"
        ? Object.fromEntries(
            shares.map((share) => [
              share.userId,
              basisPointsToInput(share.percentBasisPoints ?? 0),
            ])
          )
        : {},
  };
}

/**
 * The form's starting values: what was saved when editing (US-12), otherwise
 * the defaults NFR-01 relies on: today's date, the member recording it as the
 * payer (UC-05 step 3), everyone included, split equally.
 */
export function initialFormValues(
  existing: Expense | undefined,
  memberIds: readonly string[],
  currentUserId: string | null,
  today: string
): ExpenseFormValues {
  if (existing) return formValuesFromExpense(existing, memberIds);

  const payer = currentUserId && memberIds.includes(currentUserId) ? currentUserId : memberIds[0] ?? "";
  return {
    description: "",
    amount: "",
    expenseDate: today,
    paidByUserId: payer,
    selected: [...memberIds],
    splitMethod: "EQUAL",
    customAmounts: {},
    percents: {},
  };
}

/** The words and destinations that differ between adding and editing. */
export type FormCopy = {
  heading: string;
  saveLabel: string;
  cancelTo: string;
};

export function formCopy(existing: Pick<Expense, "id"> | undefined): FormCopy {
  return existing
    ? { heading: "Edit expense", saveLabel: "Save changes", cancelTo: `/expenses/${existing.id}` }
    : { heading: "Add an expense", saveLabel: "Save expense", cancelTo: "/" };
}

/**
 * The preview request for the split as it stands, as a string so a stale
 * answer can be recognised, or null when the split isn't complete enough to
 * ask. The server validates the whole body, so a placeholder stands in for a
 * description not typed yet, and today for a cleared date.
 */
export function previewKeyFor(
  split: object | null,
  description: string,
  expenseDate: string,
  today: string
): string | null {
  if (!split) return null;
  return JSON.stringify({
    ...split,
    description: description.trim() || "Preview",
    expenseDate: expenseDate || today,
  });
}
