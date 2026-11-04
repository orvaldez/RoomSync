import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { EditExpensePage } from "./AddExpensePage";
import { RequireAuth } from "../auth/RequireAuth";
import type { Expense } from "../lib/api";
import { HOUSEHOLD, ME, ME_AS_MEMBER, ORLANDO, apiError, mockedApi, renderAt, signedInAs } from "../test/render";

vi.mock("../lib/api", async (importOriginal) =>
  (await import("../test/mockApi")).mockApiModule(importOriginal)
);

/**
 * US-12: editing reuses the Add expense form, filled in with what was saved.
 * The form's own rules are tested in AddExpensePage.test.tsx.
 */
// Wrapped in RequireAuth as in App.tsx, so the page only renders once the
// signed-in user is known. Without it the page briefly decides with no user,
// and a "can't edit" test can pass on that moment rather than on the rule.
const routes = (
  <Route
    path="/expenses/:expenseId/edit"
    element={
      <RequireAuth>
        <EditExpensePage />
      </RequireAuth>
    }
  />
);

/** My $70.00 internet bill, 60% me, 40% Orlando. */
const MINE: Expense = {
  id: "e-internet",
  description: "Internet",
  totalAmountCents: 7000,
  expenseDate: "2026-10-20",
  paidBy: { userId: ME.id, name: ME.name },
  splitMethod: "PERCENTAGE",
  shares: [
    { userId: ORLANDO.userId, name: ORLANDO.name, amountOwedCents: 2800, percentBasisPoints: 4000 },
    { userId: ME.id, name: ME.name, amountOwedCents: 4200, percentBasisPoints: 6000 },
  ],
  createdAt: "2026-10-20T18:00:00.000Z",
  updatedAt: "2026-10-20T18:00:00.000Z",
  deleted: null,
  createdBy: null,
};

function setUp(expense: Expense) {
  signedInAs(ME);
  mockedApi.currentHousehold.mockResolvedValue({ household: HOUSEHOLD });
  mockedApi.members.mockResolvedValue({ members: [ORLANDO, ME_AS_MEMBER] });
  mockedApi.expense.mockResolvedValue({ expense });
  mockedApi.previewExpense.mockResolvedValue({ shares: [] });
  renderAt(`/expenses/${expense.id}/edit`, routes);
}

describe("EditExpensePage (US-12)", () => {
  it("opens the form filled in with what was saved", async () => {
    setUp(MINE);

    expect(await screen.findByRole("heading", { name: "Edit expense" })).toBeTruthy();
    expect((screen.getByLabelText("Description") as HTMLInputElement).value).toBe("Internet");
    expect((screen.getByLabelText("Amount ($)") as HTMLInputElement).value).toBe("70.00");
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-10-20");
    expect((screen.getByRole("radio", { name: "By percentage" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(`Share for ${ORLANDO.name} (%)`) as HTMLInputElement).value).toBe("40");
    expect((screen.getByLabelText(`Share for ${ME.name} (you) (%)`) as HTMLInputElement).value).toBe("60");
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/expenses/e-internet");
  });

  it("saves the change and returns to the expense", async () => {
    setUp(MINE);
    mockedApi.updateExpense.mockResolvedValue({ expense: { ...MINE, totalAmountCents: 8000 } });
    const user = userEvent.setup();
    const amount = await screen.findByLabelText("Amount ($)");

    await user.clear(amount);
    await user.type(amount, "80.00");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockedApi.updateExpense).toHaveBeenCalledWith(
      HOUSEHOLD.id,
      "e-internet",
      expect.objectContaining({
        description: "Internet",
        totalAmountCents: 8000,
        splitMethod: "PERCENTAGE",
        paidByUserId: ME.id,
        participants: [
          { userId: ORLANDO.userId, percentBasisPoints: 4000 },
          { userId: ME.id, percentBasisPoints: 6000 },
        ],
      })
    );
    expect(await screen.findByText("Landed on another page at /expenses/e-internet")).toBeTruthy();
    expect(mockedApi.createExpense).not.toHaveBeenCalled();
  });

  it("tells a member who didn't pay that they can't edit it, without showing the form", async () => {
    setUp({ ...MINE, paidBy: { userId: ORLANDO.userId, name: ORLANDO.name } });

    expect(await screen.findByRole("heading", { name: "You can't edit this expense" })).toBeTruthy();
    expect(screen.queryByLabelText("Amount ($)")).toBeNull();
  });

  it("tells anyone a deleted expense can't be edited", async () => {
    setUp({ ...MINE, deleted: { at: "2026-10-25T12:00:00.000Z", by: { userId: ME.id, name: ME.name } } });

    expect(await screen.findByRole("heading", { name: "You can't edit this expense" })).toBeTruthy();
  });

  it("says an expense from another household couldn't be found", async () => {
    signedInAs(ME);
    mockedApi.currentHousehold.mockResolvedValue({ household: HOUSEHOLD });
    mockedApi.members.mockResolvedValue({ members: [ORLANDO, ME_AS_MEMBER] });
    mockedApi.expense.mockRejectedValue(apiError(404, "EXPENSE_NOT_FOUND", "Expense not found."));
    renderAt("/expenses/e-elsewhere/edit", routes);

    expect(await screen.findByRole("heading", { name: "This expense could not be found" })).toBeTruthy();
  });
});
