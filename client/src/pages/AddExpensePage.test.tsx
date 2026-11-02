import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { AddExpensePage } from "./AddExpensePage";
import type { Expense } from "../lib/api";
import { HOUSEHOLD, ME, ME_AS_MEMBER, ORLANDO, apiError, mockedApi, renderAt, signedInAs } from "../test/render";

vi.mock("../lib/api", async (importOriginal) =>
  (await import("../test/mockApi")).mockApiModule(importOriginal)
);

const routes = <Route path="/expenses/new" element={<AddExpensePage />} />;

function setUp() {
  signedInAs(ME);
  mockedApi.currentHousehold.mockResolvedValue({ household: HOUSEHOLD });
  mockedApi.members.mockResolvedValue({ members: [ORLANDO, ME_AS_MEMBER] });
  mockedApi.previewExpense.mockResolvedValue({
    shares: [
      { userId: ORLANDO.userId, name: ORLANDO.name, amountOwedCents: 2000, percentBasisPoints: null },
      { userId: ME.id, name: ME.name, amountOwedCents: 2000, percentBasisPoints: null },
    ],
  });
  renderAt("/expenses/new", routes);
}

async function fillIn(description: string, amount: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Description"), description);
  await user.type(screen.getByLabelText("Amount ($)"), amount);
  return user;
}

describe("AddExpensePage (UC-05, UC-06)", () => {
  it("shows the server's split preview once the amount is entered", async () => {
    setUp();
    await fillIn("Groceries", "40.00");

    const preview = await screen.findByRole("heading", { name: "Each person's share" });
    const panel = preview.closest("section") as HTMLElement;
    expect(await within(panel).findByText(ORLANDO.name)).toBeTruthy();
    expect(within(panel).getAllByText("$20.00")).toHaveLength(2);
    expect(mockedApi.previewExpense).toHaveBeenCalledWith(
      HOUSEHOLD.id,
      expect.objectContaining({ totalAmountCents: 4000, splitMethod: "EQUAL", paidByUserId: ME.id })
    );
  });

  it("refuses a By amount split that doesn't add up, and saves nothing", async () => {
    setUp();
    const mismatch = apiError(400, "SPLIT_SUM_MISMATCH", "Custom amounts must add up to the total.");
    mockedApi.previewExpense.mockRejectedValue(mismatch);
    mockedApi.createExpense.mockRejectedValue(mismatch);
    const user = await fillIn("Groceries", "40.00");

    await user.click(screen.getByRole("radio", { name: "By amount" }));
    await user.type(screen.getByLabelText(`${ORLANDO.name} owes ($)`), "10.00");
    await user.type(screen.getByLabelText(`${ME.name} (you) owes ($)`), "10.00");

    expect(await screen.findByText("Custom amounts must add up to the total.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save expense" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Custom amounts must add up to the total.");
    expect(screen.queryByText(/Landed on/)).toBeNull();
  });

  it("saves the expense through the API and returns to the dashboard", async () => {
    setUp();
    mockedApi.createExpense.mockResolvedValue({
      expense: { id: "e-1", description: "Groceries", totalAmountCents: 4000 } as Expense,
    });
    const user = await fillIn("Groceries", "40.00");

    await user.click(screen.getByRole("button", { name: "Save expense" }));

    expect(await screen.findByText("Landed on another page at /")).toBeTruthy();
    expect(mockedApi.createExpense).toHaveBeenCalledWith(
      HOUSEHOLD.id,
      expect.objectContaining({
        description: "Groceries",
        totalAmountCents: 4000,
        paidByUserId: ME.id,
        splitMethod: "EQUAL",
        participants: [{ userId: ORLANDO.userId }, { userId: ME.id }],
      })
    );
  });

  it("checks the form before calling the API", async () => {
    setUp();
    const user = userEvent.setup();
    await screen.findByLabelText("Description");

    await user.click(screen.getByRole("button", { name: "Save expense" }));

    expect(await screen.findByText("Description is required.")).toBeTruthy();
    expect(screen.getByText("Enter the amount.")).toBeTruthy();
    expect(mockedApi.createExpense).not.toHaveBeenCalled();
  });
});
