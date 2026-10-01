import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked before importing the service, so the real repositories — and through
// them the Prisma client — are never loaded. These tests need no database.
vi.mock("../repositories/chore.repository", () => ({
  create: vi.fn(),
  listOpen: vi.fn(),
  listCompleted: vi.fn(),
  findInHousehold: vi.fn(),
  updateOpen: vi.fn(),
  markComplete: vi.fn(),
}));

vi.mock("../repositories/household.repository", () => ({
  createWithOwner: vi.fn(),
  findCurrentForUser: vi.fn(),
  hasMembership: vi.fn(),
  findRole: vi.fn(),
  listMembers: vi.fn(),
}));

import * as choreRepository from "../repositories/chore.repository";
import * as householdRepository from "../repositories/household.repository";
import {
  completeChore,
  createChore,
  listChores,
  updateChore,
} from "./chore.service";
import {
  AssigneeNotMemberError,
  ChoreAlreadyCompleteError,
  ChoreNotAssignedToYouError,
  ChoreNotFoundError,
  ValidationError,
} from "./errors";

const create = vi.mocked(choreRepository.create);
const listOpen = vi.mocked(choreRepository.listOpen);
const listCompleted = vi.mocked(choreRepository.listCompleted);
const findInHousehold = vi.mocked(choreRepository.findInHousehold);
const updateOpen = vi.mocked(choreRepository.updateOpen);
const markComplete = vi.mocked(choreRepository.markComplete);
const findRole = vi.mocked(householdRepository.findRole);

const HOUSEHOLD_ID = "clxHOUSEHOLD0000000000000";
const CHORE_ID = "clxCHORE00000000000000000";
const AGUSTIN = "clxAGUSTIN00000000000000";
const ORLANDO = "clxORLANDO00000000000000";
const OUTSIDER = "clxOUTSIDER0000000000000";

function chore(
  overrides: Partial<choreRepository.ChoreRecord> = {}
): choreRepository.ChoreRecord {
  return {
    id: CHORE_ID,
    householdId: HOUSEHOLD_ID,
    title: "Take out bins",
    description: null,
    assignee: { userId: AGUSTIN, name: "Agustin" },
    dueDate: new Date("2026-10-02T00:00:00.000Z"),
    isComplete: false,
    completedAt: null,
    createdAt: new Date("2026-09-30T12:00:00.000Z"),
    ...overrides,
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to reject, but it resolved.");
}

beforeEach(() => {
  vi.resetAllMocks();
  // AGUSTIN and ORLANDO are members; anyone else is not.
  findRole.mockImplementation(async (userId) =>
    userId === AGUSTIN ? "OWNER" : userId === ORLANDO ? "MEMBER" : null
  );
  create.mockImplementation(async (input) =>
    chore({
      title: input.title,
      description: input.description,
      assignee: input.assignedUserId
        ? { userId: input.assignedUserId, name: "Someone" }
        : null,
      dueDate: input.dueDate,
    })
  );
  findInHousehold.mockResolvedValue(chore());
  updateOpen.mockImplementation(async () => chore());
  markComplete.mockImplementation(async (_h, _c, at) =>
    chore({ isComplete: true, completedAt: at })
  );
});

describe("createChore (UC-09 steps 1-6)", () => {
  it("creates an outstanding chore with its assignee and due date", async () => {
    const created = await createChore(HOUSEHOLD_ID, {
      title: "  Take out bins  ",
      description: "Blue bin too",
      assignedUserId: ORLANDO,
      dueDate: "2026-10-02",
    });

    expect(create).toHaveBeenCalledWith({
      householdId: HOUSEHOLD_ID,
      title: "Take out bins",
      description: "Blue bin too",
      assignedUserId: ORLANDO,
      dueDate: new Date("2026-10-02T00:00:00.000Z"),
    });
    expect(created).toMatchObject({
      isComplete: false,
      completedAt: null,
      dueDate: "2026-10-02",
    });
  });

  it("needs only a title — assignee, due date and description are optional", async () => {
    await createChore(HOUSEHOLD_ID, { title: "Vacuum" });

    expect(create).toHaveBeenCalledWith({
      householdId: HOUSEHOLD_ID,
      title: "Vacuum",
      description: null,
      assignedUserId: null,
      dueDate: null,
    });
  });

  it("stores a blank description as none", async () => {
    await createChore(HOUSEHOLD_ID, { title: "Vacuum", description: "   " });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });

  it("accepts a due date in the past (UC-09 4a)", async () => {
    await expect(
      createChore(HOUSEHOLD_ID, { title: "Clean fridge", dueDate: "2020-01-01" })
    ).resolves.toMatchObject({ dueDate: "2020-01-01" });
  });

  it.each([
    ["missing", undefined],
    ["blank", "   "],
    ["over 100 characters", "x".repeat(101)],
  ])("rejects a title that is %s (UC-09 2a)", async (_label, title) => {
    const error = await rejectionOf(createChore(HOUSEHOLD_ID, { title }));

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toHaveProperty("title");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a description over 500 characters", async () => {
    const error = await rejectionOf(
      createChore(HOUSEHOLD_ID, { title: "Vacuum", description: "x".repeat(501) })
    );

    expect((error as ValidationError).fields).toHaveProperty("description");
  });

  it.each(["tomorrow", "10/02/2026", "2026-02-30"])(
    "rejects the due date %j",
    async (dueDate) => {
      const error = await rejectionOf(createChore(HOUSEHOLD_ID, { title: "Vacuum", dueDate }));

      expect((error as ValidationError).fields).toHaveProperty("dueDate");
    }
  );

  it("reports every invalid field at once", async () => {
    const error = await rejectionOf(
      createChore(HOUSEHOLD_ID, { title: "", description: 5, dueDate: "soon" })
    );

    expect(Object.keys((error as ValidationError).fields).sort()).toEqual([
      "description",
      "dueDate",
      "title",
    ]);
  });

  it("rejects an assignee from outside the household (UC-09 3a)", async () => {
    const error = await rejectionOf(
      createChore(HOUSEHOLD_ID, { title: "Vacuum", assignedUserId: OUTSIDER })
    );

    expect(error).toBeInstanceOf(AssigneeNotMemberError);
    expect(error).toMatchObject({ code: "ASSIGNEE_NOT_MEMBER", status: 400 });
    expect(findRole).toHaveBeenCalledWith(OUTSIDER, HOUSEHOLD_ID);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a malformed assignee as not a member", async () => {
    await expect(
      createChore(HOUSEHOLD_ID, { title: "Vacuum", assignedUserId: 42 })
    ).rejects.toThrow(AssigneeNotMemberError);
  });
});

describe("listChores", () => {
  it("returns open chores followed by completed ones when unfiltered", async () => {
    listOpen.mockResolvedValue([chore({ id: "open-1" })]);
    listCompleted.mockResolvedValue([
      chore({ id: "done-1", isComplete: true, completedAt: new Date() }),
    ]);

    const chores = await listChores(HOUSEHOLD_ID, undefined);

    expect(chores.map((c) => c.id)).toEqual(["open-1", "done-1"]);
  });

  it("filters to open or completed", async () => {
    listOpen.mockResolvedValue([chore({ id: "open-1" })]);
    listCompleted.mockResolvedValue([chore({ id: "done-1", isComplete: true })]);

    expect((await listChores(HOUSEHOLD_ID, "open")).map((c) => c.id)).toEqual(["open-1"]);
    expect((await listChores(HOUSEHOLD_ID, "completed")).map((c) => c.id)).toEqual([
      "done-1",
    ]);
  });

  it("rejects any other status", async () => {
    const error = await rejectionOf(listChores(HOUSEHOLD_ID, "overdue"));

    expect((error as ValidationError).fields).toHaveProperty("status");
  });

  it("serializes the due date as YYYY-MM-DD and keeps null for none", async () => {
    listOpen.mockResolvedValue([chore(), chore({ id: "undated", dueDate: null })]);
    listCompleted.mockResolvedValue([]);

    const chores = await listChores(HOUSEHOLD_ID, undefined);

    expect(chores.map((c) => c.dueDate)).toEqual(["2026-10-02", null]);
  });
});

describe("updateChore", () => {
  it("reassigns an outstanding chore to another member", async () => {
    await updateChore(HOUSEHOLD_ID, CHORE_ID, { assignedUserId: ORLANDO });

    expect(updateOpen).toHaveBeenCalledWith(HOUSEHOLD_ID, CHORE_ID, {
      assignedUserId: ORLANDO,
    });
  });

  it("clears the assignee and due date with null", async () => {
    await updateChore(HOUSEHOLD_ID, CHORE_ID, { assignedUserId: null, dueDate: null });

    expect(updateOpen).toHaveBeenCalledWith(HOUSEHOLD_ID, CHORE_ID, {
      assignedUserId: null,
      dueDate: null,
    });
  });

  it("changes only the fields that were sent", async () => {
    await updateChore(HOUSEHOLD_ID, CHORE_ID, { title: " Mop floors " });

    expect(updateOpen).toHaveBeenCalledWith(HOUSEHOLD_ID, CHORE_ID, {
      title: "Mop floors",
    });
  });

  it("rejects a reassignment to a non-member", async () => {
    await expect(
      updateChore(HOUSEHOLD_ID, CHORE_ID, { assignedUserId: OUTSIDER })
    ).rejects.toThrow(AssigneeNotMemberError);
    expect(updateOpen).not.toHaveBeenCalled();
  });

  it("rejects an invalid new title", async () => {
    const error = await rejectionOf(updateChore(HOUSEHOLD_ID, CHORE_ID, { title: "" }));

    expect((error as ValidationError).fields).toHaveProperty("title");
    expect(updateOpen).not.toHaveBeenCalled();
  });

  it("refuses to edit a completed chore", async () => {
    findInHousehold.mockResolvedValue(chore({ isComplete: true, completedAt: new Date() }));

    const error = await rejectionOf(
      updateChore(HOUSEHOLD_ID, CHORE_ID, { assignedUserId: ORLANDO })
    );

    expect(error).toBeInstanceOf(ChoreAlreadyCompleteError);
    expect(error).toMatchObject({ code: "CHORE_ALREADY_COMPLETE", status: 409 });
    expect(updateOpen).not.toHaveBeenCalled();
  });

  it("refuses when the chore was completed between the read and the write", async () => {
    updateOpen.mockResolvedValue(null);

    await expect(
      updateChore(HOUSEHOLD_ID, CHORE_ID, { title: "Mop floors" })
    ).rejects.toThrow(ChoreAlreadyCompleteError);
  });

  it("returns CHORE_NOT_FOUND for a chore not in this household", async () => {
    findInHousehold.mockResolvedValue(null);

    const error = await rejectionOf(updateChore(HOUSEHOLD_ID, "clxNOPE", { title: "x" }));

    expect(error).toBeInstanceOf(ChoreNotFoundError);
    expect(error).toMatchObject({ code: "CHORE_NOT_FOUND", status: 404 });
  });
});

describe("completeChore (UC-09 steps 8-11)", () => {
  it("lets the assigned member complete it, recording when", async () => {
    const before = Date.now();

    const done = await completeChore(HOUSEHOLD_ID, CHORE_ID, AGUSTIN);

    const at = markComplete.mock.calls[0][2];
    expect(at.getTime()).toBeGreaterThanOrEqual(before);
    expect(done).toMatchObject({ isComplete: true, completedAt: at });
  });

  it("rejects anyone else (UC-09 9a)", async () => {
    const error = await rejectionOf(completeChore(HOUSEHOLD_ID, CHORE_ID, ORLANDO));

    expect(error).toBeInstanceOf(ChoreNotAssignedToYouError);
    expect(error).toMatchObject({ code: "CHORE_NOT_ASSIGNED_TO_YOU", status: 403 });
    expect(markComplete).not.toHaveBeenCalled();
  });

  it("lets any member complete an unassigned chore (UC-09 9b)", async () => {
    findInHousehold.mockResolvedValue(chore({ assignee: null }));

    await expect(completeChore(HOUSEHOLD_ID, CHORE_ID, ORLANDO)).resolves.toMatchObject({
      isComplete: true,
    });
  });

  it("returns an already-complete chore unchanged, keeping its time (UC-09 8a)", async () => {
    const original = new Date("2026-09-30T08:00:00.000Z");
    findInHousehold.mockResolvedValue(chore({ isComplete: true, completedAt: original }));

    const done = await completeChore(HOUSEHOLD_ID, CHORE_ID, AGUSTIN);

    expect(done.completedAt).toEqual(original);
    expect(markComplete).not.toHaveBeenCalled();
  });

  it("returns CHORE_NOT_FOUND for a chore not in this household", async () => {
    findInHousehold.mockResolvedValue(null);

    await expect(completeChore(HOUSEHOLD_ID, "clxNOPE", AGUSTIN)).rejects.toThrow(
      ChoreNotFoundError
    );
  });
});
