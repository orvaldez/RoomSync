import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { Route } from "react-router-dom";
import { HistoryPage } from "./HistoryPage";
import type { Chore, Expense, Settlement } from "../lib/api";
import { HOUSEHOLD, ME, ORLANDO, mockedApi, renderAt, signedInAs } from "../test/render";

vi.mock("../lib/api", async (importOriginal) =>
  (await import("../test/mockApi")).mockApiModule(importOriginal)
);

/**
 * UC-11: everything the household has recorded, in three lists, each with
 * its own empty state, and deleted expenses kept (US-12).
 */
const routes = <Route path="/history" element={<HistoryPage />} />;

function expense(id: string, description: string, overrides: Partial<Expense> = {}): Expense {
  return {
    id,
    description,
    totalAmountCents: 4000,
    expenseDate: "2026-10-20",
    paidBy: { userId: ORLANDO.userId, name: ORLANDO.name },
    splitMethod: "EQUAL",
    shares: [
      { userId: ME.id, name: ME.name, amountOwedCents: 2000, percentBasisPoints: null },
      { userId: ORLANDO.userId, name: ORLANDO.name, amountOwedCents: 2000, percentBasisPoints: null },
    ],
    createdAt: "2026-10-20T18:00:00.000Z",
    updatedAt: "2026-10-20T18:00:00.000Z",
    deleted: null,
    createdBy: null,
    ...overrides,
  };
}

const PAYMENT: Settlement = {
  id: "s1",
  from: { userId: ME.id, name: ME.name },
  to: { userId: ORLANDO.userId, name: ORLANDO.name },
  amountCents: 2000,
  note: "Venmo",
  settledAt: "2026-10-22T12:00:00.000Z",
  createdBy: { userId: ORLANDO.userId, name: ORLANDO.name },
};

const DONE: Chore = {
  id: "c1",
  title: "Take out the trash",
  description: null,
  assignee: { userId: ME.id, name: ME.name },
  dueDate: "2026-10-23",
  isComplete: true,
  completedAt: "2026-10-23T09:00:00.000Z",
  createdAt: "2026-10-19T09:00:00.000Z",
};

function setUp(lists: { expenses?: Expense[]; settlements?: Settlement[]; chores?: Chore[] }) {
  signedInAs(ME);
  mockedApi.currentHousehold.mockResolvedValue({ household: HOUSEHOLD });
  mockedApi.expenses.mockResolvedValue({ expenses: lists.expenses ?? [] });
  mockedApi.settlements.mockResolvedValue({ settlements: lists.settlements ?? [] });
  mockedApi.chores.mockResolvedValue({ chores: lists.chores ?? [] });
  renderAt("/history", routes);
}

function section(name: string): HTMLElement {
  return screen.getByRole("heading", { name, level: 2 }).closest("section") as HTMLElement;
}

describe("HistoryPage (UC-11)", () => {
  it("lists expenses, payments and completed chores, with a count for each", async () => {
    setUp({
      expenses: [expense("e2", "Groceries"), expense("e1", "Internet")],
      settlements: [PAYMENT],
      chores: [DONE],
    });

    expect(await screen.findByRole("link", { name: "Expenses (2)" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Payments (1)" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Completed chores (1)" })).toBeTruthy();

    // In the order the server returned them: newest first.
    const expenseLinks = within(section("Expenses")).getAllByRole("link");
    expect(expenseLinks.map((link) => link.textContent)).toEqual(["Groceries", "Internet"]);
    expect(expenseLinks[0].getAttribute("href")).toBe("/expenses/e2");

    expect(within(section("Payments")).getByText(`You paid ${ORLANDO.name} $20.00`)).toBeTruthy();
    // Orlando recorded the payment I made (#90), so History says who entered it.
    expect(
      within(section("Payments")).getByText(new RegExp(`· Venmo · Recorded by ${ORLANDO.name}$`))
    ).toBeTruthy();
    expect(within(section("Completed chores")).getByText("Take out the trash")).toBeTruthy();
    expect(within(section("Completed chores")).getByText(/^Assigned to you · completed /)).toBeTruthy();
  });

  it("asks for deleted expenses too, and only completed chores", async () => {
    setUp({});
    await screen.findByRole("heading", { name: "History" });

    expect(mockedApi.expenses).toHaveBeenCalledWith(HOUSEHOLD.id, { includeDeleted: true });
    expect(mockedApi.chores).toHaveBeenCalledWith(HOUSEHOLD.id, "completed");
  });

  it("keeps a deleted expense, saying who deleted it and what the share was", async () => {
    setUp({
      expenses: [
        expense("e1", "Internet", {
          deleted: { at: "2026-10-25T12:00:00.000Z", by: { userId: ORLANDO.userId, name: ORLANDO.name } },
        }),
      ],
    });

    const expenses = await screen.findByRole("heading", { name: "Expenses", level: 2 });
    const panel = expenses.closest("section") as HTMLElement;
    expect(within(panel).getByText(new RegExp(`^Deleted by ${ORLANDO.name} on `))).toBeTruthy();
    expect(within(panel).getByText("your share was $20.00")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "Internet" }).className).toContain("expense-deleted");
  });

  it("shows an empty state for each list, naming where records are made", async () => {
    setUp({});

    await screen.findByRole("heading", { name: "History" });
    expect(within(section("Expenses")).getByRole("link", { name: "Add an expense" })).toBeTruthy();
    expect(within(section("Payments")).getByRole("link", { name: "record it on Balances" })).toBeTruthy();
    expect(within(section("Completed chores")).getByRole("link", { name: "Open chores" })).toBeTruthy();
  });

  it("says so when the history can't be loaded", async () => {
    signedInAs(ME);
    mockedApi.currentHousehold.mockResolvedValue({ household: HOUSEHOLD });
    mockedApi.expenses.mockRejectedValue(new Error("network down"));
    mockedApi.settlements.mockResolvedValue({ settlements: [] });
    mockedApi.chores.mockResolvedValue({ chores: [] });
    renderAt("/history", routes);

    expect(await screen.findByText("We could not load the history.")).toBeTruthy();
  });
});
