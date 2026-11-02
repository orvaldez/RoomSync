import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";
import type { Dashboard, Expense } from "../lib/api";
import { HOUSEHOLD, ME, ME_AS_MEMBER, ORLANDO, mockedApi, renderAt, signedInAs } from "../test/render";

vi.mock("../lib/api", async (importOriginal) =>
  (await import("../test/mockApi")).mockApiModule(importOriginal)
);

const GROCERIES: Expense = {
  id: "e-groceries",
  description: "Groceries",
  totalAmountCents: 8451,
  expenseDate: "2026-10-24",
  paidBy: { userId: ORLANDO.userId, name: ORLANDO.name },
  splitMethod: "EQUAL",
  shares: [
    { userId: ORLANDO.userId, name: ORLANDO.name, amountOwedCents: 4226, percentBasisPoints: null },
    { userId: ME.id, name: ME.name, amountOwedCents: 4225, percentBasisPoints: null },
  ],
  createdAt: "2026-10-24T18:00:00.000Z",
  updatedAt: "2026-10-24T18:00:00.000Z",
  deleted: null,
};

const SEEDED: Dashboard = {
  household: HOUSEHOLD,
  members: [ORLANDO, ME_AS_MEMBER],
  balances: {
    balances: [{ userId: ORLANDO.userId, name: ORLANDO.name, netCents: -4225 }],
    totals: { youOweCents: 4225, owedToYouCents: 0 },
  },
  upcomingChores: [
    {
      id: "c-trash",
      title: "Take out the trash",
      description: null,
      assignee: { userId: ME.id, name: ME.name },
      dueDate: null,
      isComplete: false,
      completedAt: null,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  recentActivity: [{ type: "EXPENSE", at: GROCERIES.createdAt, expense: GROCERIES }],
};

const EMPTY: Dashboard = {
  household: { ...HOUSEHOLD, role: "OWNER" },
  members: [{ ...ME_AS_MEMBER, role: "OWNER" }],
  balances: { balances: [], totals: { youOweCents: 0, owedToYouCents: 0 } },
  upcomingChores: [],
  recentActivity: [],
};

function setUp(dashboard: Dashboard | null) {
  signedInAs(ME);
  mockedApi.currentHousehold.mockResolvedValue({ household: dashboard ? dashboard.household : null });
  if (dashboard) mockedApi.dashboard.mockResolvedValue(dashboard);
  mockedApi.expenses.mockResolvedValue({ expenses: dashboard?.recentActivity.length ? [GROCERIES] : [] });
  // The owner's Members panel lists the invitation links still in use (US-14).
  mockedApi.pendingInvitations.mockResolvedValue({ invitations: [] });
  renderAt("/", <Route path="/" element={<DashboardPage />} />);
}

describe("DashboardPage (UC-10)", () => {
  it("shows the household's members, balance, chores and activity", async () => {
    setUp(SEEDED);

    expect(await screen.findByRole("heading", { level: 1, name: "Apartment 41" })).toBeTruthy();
    expect(screen.getByText(ORLANDO.name, { selector: "li" })).toBeTruthy();
    expect(screen.getByText(`You owe ${ORLANDO.name} $42.25`)).toBeTruthy();
    expect(screen.getByText("Take out the trash")).toBeTruthy();
    expect(screen.getByText(`${ORLANDO.name} added "Groceries" · $84.51`)).toBeTruthy();
    expect(mockedApi.dashboard).toHaveBeenCalledWith(HOUSEHOLD.id);
  });

  it("guides an owner who is alone in a new household", async () => {
    setUp(EMPTY);

    expect(await screen.findByRole("heading", { level: 1, name: "Apartment 41" })).toBeTruthy();
    expect(screen.getByText("It is just you so far. Invite a roommate to start sharing costs.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite a roommate" })).toBeTruthy();
    expect(screen.getByText(/Nothing is assigned to you\./)).toBeTruthy();
    expect(screen.getByText(/Nothing has happened yet\./)).toBeTruthy();
  });

  it("says when the household can't be loaded, and tries again on request", async () => {
    signedInAs(ME);
    mockedApi.currentHousehold.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mockedApi.currentHousehold.mockResolvedValue({ household: SEEDED.household });
    mockedApi.dashboard.mockResolvedValue(SEEDED);
    mockedApi.expenses.mockResolvedValue({ expenses: [GROCERIES] });
    renderAt("/", <Route path="/" element={<DashboardPage />} />);

    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeTruthy();

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Apartment 41" })).toBeTruthy();
  });

  it("offers to set up a household to someone who has none", async () => {
    setUp(null);

    expect(await screen.findByRole("heading", { name: "Set up your household" })).toBeTruthy();
    expect(mockedApi.dashboard).not.toHaveBeenCalled();
  });
});
