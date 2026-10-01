import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

// Every repository is mocked, so these tests exercise the HTTP boundary, both
// guards, and the service without a database.
vi.mock("../repositories/user.repository", () => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
}));

vi.mock("../repositories/household.repository", () => ({
  createWithOwner: vi.fn(),
  findCurrentForUser: vi.fn(),
  hasMembership: vi.fn(),
  findRole: vi.fn(),
  listMembers: vi.fn(),
}));

vi.mock("../repositories/chore.repository", () => ({
  create: vi.fn(),
  listOpen: vi.fn(),
  listCompleted: vi.fn(),
  findInHousehold: vi.fn(),
  updateOpen: vi.fn(),
  markComplete: vi.fn(),
}));

import * as userRepository from "../repositories/user.repository";
import * as householdRepository from "../repositories/household.repository";
import * as choreRepository from "../repositories/chore.repository";
import app from "../app";

const findByEmail = vi.mocked(userRepository.findByEmail);
const findRole = vi.mocked(householdRepository.findRole);
const create = vi.mocked(choreRepository.create);
const listOpen = vi.mocked(choreRepository.listOpen);
const listCompleted = vi.mocked(choreRepository.listCompleted);
const findInHousehold = vi.mocked(choreRepository.findInHousehold);
const updateOpen = vi.mocked(choreRepository.updateOpen);
const markComplete = vi.mocked(choreRepository.markComplete);

const PASSWORD = "correct-horse";
const USER = {
  id: "clx0000000000000000000000",
  name: "Agustin",
  email: "agustin@crimson.ua.edu",
  passwordHash: bcrypt.hashSync(PASSWORD, 10),
  createdAt: new Date("2026-09-18T00:00:00Z"),
};
const ORLANDO = "clxORLANDO00000000000000";

const HOUSEHOLD_ID = "clx1111111111111111111111";
const CHORES_URL = `/api/households/${HOUSEHOLD_ID}/chores`;

const STORED: choreRepository.ChoreRecord = {
  id: "clxCHORE00000000000000000",
  householdId: HOUSEHOLD_ID,
  title: "Take out bins",
  description: null,
  assignee: { userId: USER.id, name: "Agustin" },
  dueDate: new Date("2026-10-02T00:00:00.000Z"),
  isComplete: false,
  completedAt: null,
  createdAt: new Date("2026-09-30T12:00:00.000Z"),
};

/** A supertest agent carrying a real session cookie from the login endpoint. */
async function signedInAgent() {
  const agent = request.agent(app);
  findByEmail.mockResolvedValue(USER);

  const res = await agent
    .post("/api/auth/login")
    .send({ email: USER.email, password: PASSWORD });

  expect(res.status).toBe(200);
  return agent;
}

beforeEach(() => {
  vi.resetAllMocks();
  findByEmail.mockResolvedValue(null);
  // The requester and ORLANDO are members of the household in the URL.
  findRole.mockImplementation(async (userId) =>
    userId === USER.id ? "OWNER" : userId === ORLANDO ? "MEMBER" : null
  );
  create.mockResolvedValue(STORED);
  listOpen.mockResolvedValue([STORED]);
  listCompleted.mockResolvedValue([]);
  findInHousehold.mockResolvedValue(STORED);
  updateOpen.mockResolvedValue(STORED);
  markComplete.mockImplementation(async (_h, _c, at) => ({
    ...STORED,
    isComplete: true,
    completedAt: at,
  }));
});

describe("POST /api/households/:householdId/chores", () => {
  it("returns 201 with the chore as ChorePublic", async () => {
    const agent = await signedInAgent();

    const res = await agent
      .post(CHORES_URL)
      .send({ title: "Take out bins", assignedUserId: USER.id, dueDate: "2026-10-02" });

    expect(res.status).toBe(201);
    expect(res.body.chore).toEqual({
      id: STORED.id,
      title: "Take out bins",
      description: null,
      assignee: { userId: USER.id, name: "Agustin" },
      dueDate: "2026-10-02",
      isComplete: false,
      completedAt: null,
      createdAt: "2026-09-30T12:00:00.000Z",
    });
  });

  it("creates the chore in the household from the URL, not the body", async () => {
    const agent = await signedInAgent();

    await agent
      .post(CHORES_URL)
      .send({ title: "Vacuum", householdId: "clxSOMEONEELSES000000000" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: HOUSEHOLD_ID })
    );
  });

  it("returns 400 VALIDATION_FAILED for an empty title, creating nothing", async () => {
    const agent = await signedInAgent();

    const res = await agent.post(CHORES_URL).send({ title: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.fields).toHaveProperty("title");
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 400 ASSIGNEE_NOT_MEMBER for an outsider", async () => {
    const agent = await signedInAgent();

    const res = await agent
      .post(CHORES_URL)
      .send({ title: "Vacuum", assignedUserId: "clxOUTSIDER0000000000000" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ASSIGNEE_NOT_MEMBER");
  });
});

describe("GET /api/households/:householdId/chores", () => {
  it("returns 200 with the household's chores", async () => {
    const agent = await signedInAgent();

    const res = await agent.get(CHORES_URL);

    expect(res.status).toBe(200);
    expect(listOpen).toHaveBeenCalledWith(HOUSEHOLD_ID);
    expect(res.body.chores).toHaveLength(1);
  });

  it("passes the status filter through", async () => {
    const agent = await signedInAgent();

    await agent.get(`${CHORES_URL}?status=completed`);

    expect(listCompleted).toHaveBeenCalledWith(HOUSEHOLD_ID);
    expect(listOpen).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown status", async () => {
    const agent = await signedInAgent();

    const res = await agent.get(`${CHORES_URL}?status=overdue`);

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty("status");
  });
});

describe("PATCH /api/households/:householdId/chores/:choreId", () => {
  it("reassigns the chore", async () => {
    const agent = await signedInAgent();

    const res = await agent
      .patch(`${CHORES_URL}/${STORED.id}`)
      .send({ assignedUserId: ORLANDO });

    expect(res.status).toBe(200);
    expect(updateOpen).toHaveBeenCalledWith(HOUSEHOLD_ID, STORED.id, {
      assignedUserId: ORLANDO,
    });
  });

  it("returns 409 CHORE_ALREADY_COMPLETE for a completed chore", async () => {
    findInHousehold.mockResolvedValue({
      ...STORED,
      isComplete: true,
      completedAt: new Date(),
    });
    const agent = await signedInAgent();

    const res = await agent.patch(`${CHORES_URL}/${STORED.id}`).send({ title: "x" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CHORE_ALREADY_COMPLETE");
  });

  it("returns 404 CHORE_NOT_FOUND for a chore not in this household", async () => {
    findInHousehold.mockResolvedValue(null);
    const agent = await signedInAgent();

    const res = await agent.patch(`${CHORES_URL}/clxELSEWHERE000000000000`).send({ title: "x" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CHORE_NOT_FOUND");
  });
});

describe("POST /api/households/:householdId/chores/:choreId/complete", () => {
  it("lets the assignee complete it", async () => {
    const agent = await signedInAgent();

    const res = await agent.post(`${CHORES_URL}/${STORED.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.chore.isComplete).toBe(true);
    expect(res.body.chore.completedAt).toBeTruthy();
  });

  it("returns 403 CHORE_NOT_ASSIGNED_TO_YOU for someone else's chore", async () => {
    findInHousehold.mockResolvedValue({
      ...STORED,
      assignee: { userId: ORLANDO, name: "Orlando" },
    });
    const agent = await signedInAgent();

    const res = await agent.post(`${CHORES_URL}/${STORED.id}/complete`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CHORE_NOT_ASSIGNED_TO_YOU");
    expect(markComplete).not.toHaveBeenCalled();
  });
});

describe("chore routes — authorization (FR-03, NFR-07)", () => {
  it("returns 401 without a session and creates nothing", async () => {
    const res = await request(app).post(CHORES_URL).send({ title: "Vacuum" });

    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", CHORES_URL],
    ["GET", CHORES_URL],
    ["PATCH", `${CHORES_URL}/${STORED.id}`],
    ["POST", `${CHORES_URL}/${STORED.id}/complete`],
  ])("returns 404 HOUSEHOLD_NOT_FOUND to a non-member (%s %s)", async (method, url) => {
    findRole.mockResolvedValue(null);
    const agent = await signedInAgent();

    const res =
      method === "GET"
        ? await agent.get(url)
        : method === "PATCH"
          ? await agent.patch(url).send({ title: "x" })
          : await agent.post(url).send({ title: "x" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("HOUSEHOLD_NOT_FOUND");
    expect(create).not.toHaveBeenCalled();
    expect(updateOpen).not.toHaveBeenCalled();
    expect(markComplete).not.toHaveBeenCalled();
  });
});
