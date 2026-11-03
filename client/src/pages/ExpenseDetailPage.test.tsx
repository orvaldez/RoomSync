import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { ExpenseDetailPage } from "./ExpenseDetailPage";
import type { Expense, Household } from "../lib/api";
import { HOUSEHOLD, ME, ORLANDO, apiError, mockedApi, renderAt, signedInAs } from "../test/render";

vi.mock("../lib/api", async (importOriginal) =>
  (await import("../test/mockApi")).mockApiModule(importOriginal)
);

/**
 * Wireframe 9 (UC-11) and its Edit and Delete (US-12, UC-12). The server
 * decides who may change an expense; these check the screen offers the
 * actions to the right people, asks before deleting, and shows a deleted
 * expense for what it is.
 */
const routes = <Route path="/expenses/:expenseId" element={<ExpenseDetailPage />} />;

/** Orlando's $70.00 internet bill, 60% me and 40% Orlando. */
function internet(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "e-internet",
    description: "Internet",
    totalAmountCents: 7000,
    expenseDate: "2026-10-20",
    paidBy: { userId: ORLANDO.userId, name: ORLANDO.name },
    splitMethod: "PERCENTAGE",
    shares: [
      { userId: ME.id, name: ME.name, amountOwedCents: 4200, percentBasisPoints: 6000 },
      { userId: ORLANDO.userId, name: ORLANDO.name, amountOwedCents: 2800, percentBasisPoints: 4000 },
    ],
    createdAt: "2026-10-20T18:00:00.000Z",
    updatedAt: "2026-10-20T18:00:00.000Z",
    deleted: null,
    ...overrides,
  };
}

const MINE = { paidBy: { userId: ME.id, name: ME.name } };

function setUp(expense: Expense, household: Household = HOUSEHOLD) {
  signedInAs(ME);
  mockedApi.currentHousehold.mockResolvedValue({ household });
  mockedApi.expense.mockResolvedValue({ expense });
  renderAt(`/expenses/${expense.id}`, routes);
}

describe("ExpenseDetailPage (UC-11)", () => {
  it("shows the payer, the date, the split and every share", async () => {
    setUp(internet());

    expect(await screen.findByRole("heading", { name: "Internet" })).toBeTruthy();
    expect(screen.getByText(`Paid by ${ORLANDO.name} on Tuesday, October 20`)).toBeTruthy();
    expect(screen.getByText("Split by percentage between 2 people")).toBeTruthy();

    const shares = screen.getByRole("heading", { name: "Shares" }).closest("section") as HTMLElement;
    const rows = within(shares).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "You · 60%$42.00",
      `${ORLANDO.name} (paid) · 40%$28.00`,
      "Total$70.00",
    ]);
  });

  it("says an expense from another household couldn't be found", async () => {
    signedInAs(ME);
    mockedApi.currentHousehold.mockResolvedValue({ household: HOUSEHOLD });
    mockedApi.expense.mockRejectedValue(apiError(404, "EXPENSE_NOT_FOUND", "Expense not found."));
    renderAt("/expenses/e-elsewhere", routes);

    expect(await screen.findByRole("heading", { name: "This expense could not be found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to History" }).getAttribute("href")).toBe("/history");
  });
});

describe("ExpenseDetailPage: who may edit or delete (US-12)", () => {
  it("offers Edit and Delete to the member who paid", async () => {
    setUp(internet(MINE));

    expect(await screen.findByRole("button", { name: "Delete" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe("/expenses/e-internet/edit");
  });

  it("offers them to the household owner, for anyone's expense", async () => {
    setUp(internet(), { ...HOUSEHOLD, role: "OWNER" });

    expect(await screen.findByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("offers neither to a member who didn't pay", async () => {
    setUp(internet());

    await screen.findByRole("heading", { name: "Shares" });
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });
});

describe("ExpenseDetailPage: deleting (UC-12)", () => {
  it("asks first, and Keep it changes nothing", async () => {
    setUp(internet(MINE));
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByRole("heading", { name: "Delete “Internet”?" })).toBeTruthy();
    expect(screen.getByText(/Payments\s+already recorded stay as they are/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Keep it" }));

    expect(mockedApi.deleteExpense).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("deletes after confirming, then shows the expense as deleted with no actions", async () => {
    setUp(internet(MINE));
    mockedApi.deleteExpense.mockResolvedValue(undefined);
    mockedApi.expense.mockResolvedValueOnce({ expense: internet(MINE) }).mockResolvedValueOnce({
      expense: internet({ ...MINE, deleted: { at: "2026-11-03T15:00:00.000Z", by: { userId: ME.id, name: ME.name } } }),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete expense" }));

    expect(mockedApi.deleteExpense).toHaveBeenCalledWith(HOUSEHOLD.id, "e-internet");
    expect(await screen.findByText(/Deleted by you on/)).toBeTruthy();
    expect(screen.getByText("Deleted “Internet”. Balances are updated.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });

  it("shows the server's refusal and stays on the confirmation", async () => {
    setUp(internet(MINE));
    mockedApi.deleteExpense.mockRejectedValue(
      apiError(403, "NOT_EXPENSE_EDITOR", "Only the member who paid or the household owner can change this expense.")
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete expense" }));

    expect(
      await screen.findByText("Only the member who paid or the household owner can change this expense.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete expense" })).toBeTruthy();
  });
});
