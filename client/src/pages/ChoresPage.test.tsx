import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { ChoresPage } from "./ChoresPage";
import type { Chore } from "../lib/api";
import { HOUSEHOLD, ME, ME_AS_MEMBER, ORLANDO, apiError, mockedApi, renderAt, signedInAs } from "../test/render";

vi.mock("../lib/api", async (importOriginal) =>
  (await import("../test/mockApi")).mockApiModule(importOriginal)
);

function chore(overrides: Partial<Chore>): Chore {
  return {
    id: "c-1",
    title: "Chore",
    description: null,
    assignee: null,
    dueDate: null,
    isComplete: false,
    completedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const MINE = chore({ id: "c-trash", title: "Take out the trash", assignee: { userId: ME.id, name: ME.name } });
const ORLANDOS = chore({
  id: "c-vacuum",
  title: "Vacuum the living room",
  assignee: { userId: ORLANDO.userId, name: ORLANDO.name },
});

function setUp() {
  signedInAs(ME);
  mockedApi.currentHousehold.mockResolvedValue({ household: HOUSEHOLD });
  mockedApi.members.mockResolvedValue({ members: [ORLANDO, ME_AS_MEMBER] });
  mockedApi.chores.mockResolvedValue({ chores: [MINE, ORLANDOS] });
  renderAt("/chores", <Route path="/chores" element={<ChoresPage />} />);
}

function choreItem(title: string): HTMLElement {
  return screen.getByText(title).closest("li") as HTMLElement;
}

describe("ChoresPage (UC-09)", () => {
  it("lets you complete your own chore, which moves it to Completed", async () => {
    setUp();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Outstanding (2)" });
    mockedApi.completeChore.mockResolvedValue({
      chore: { ...MINE, isComplete: true, completedAt: "2026-11-02T12:00:00.000Z" },
    });

    await user.click(within(choreItem("Take out the trash")).getByRole("button", { name: "Mark complete" }));

    expect(mockedApi.completeChore).toHaveBeenCalledWith(HOUSEHOLD.id, MINE.id);
    expect(await screen.findByRole("heading", { name: "Completed (1)" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Outstanding (1)" })).toBeTruthy();
  });

  it("offers no button on someone else's chore and says who can complete it", async () => {
    setUp();
    await screen.findByRole("heading", { name: "Outstanding (2)" });

    const theirs = choreItem("Vacuum the living room");
    expect(within(theirs).queryByRole("button", { name: "Mark complete" })).toBeNull();
    expect(within(theirs).getByText(`Only ${ORLANDO.name} can mark this complete.`)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Mark complete" })).toHaveLength(1);
  });

  it("shows the server's refusal on the chore it was for", async () => {
    setUp();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Outstanding (2)" });
    mockedApi.completeChore.mockRejectedValue(
      apiError(403, "CHORE_NOT_ASSIGNED_TO_YOU", "Only the assigned member can complete this chore.")
    );

    await user.click(within(choreItem("Take out the trash")).getByRole("button", { name: "Mark complete" }));

    expect(await within(choreItem("Take out the trash")).findByRole("alert")).toHaveProperty(
      "textContent",
      "Only the assigned member can complete this chore."
    );
    expect(screen.getByRole("heading", { name: "Completed (0)" })).toBeTruthy();
  });
});
