import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked before importing the service, so the real repository — and through
// it the Prisma client — is never loaded. These tests need no database.
vi.mock("../repositories/household.repository", () => ({
  createWithOwner: vi.fn(),
  findCurrentForUser: vi.fn(),
  hasMembership: vi.fn(),
  findRole: vi.fn(),
  listMembers: vi.fn(),
}));

import * as householdRepository from "../repositories/household.repository";
import {
  createHousehold,
  getCurrentHousehold,
  listMembers as listHouseholdMembers,
  requireMembership,
} from "./household.service";
import {
  AlreadyInHouseholdError,
  HouseholdNotFoundError,
  ValidationError,
} from "./errors";

const createWithOwner = vi.mocked(householdRepository.createWithOwner);
const findCurrentForUser = vi.mocked(householdRepository.findCurrentForUser);
const hasMembership = vi.mocked(householdRepository.hasMembership);
const findRole = vi.mocked(householdRepository.findRole);
const listMembers = vi.mocked(householdRepository.listMembers);

const USER_ID = "clx0000000000000000000000";

/** Echo back what the repository was asked to store, as the database would. */
function storedHousehold(
  overrides: Partial<householdRepository.HouseholdWithRole> = {}
) {
  return {
    id: "clx1111111111111111111111",
    name: "Apartment 4B",
    createdAt: new Date("2026-09-28T00:00:00Z"),
    role: "OWNER" as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  hasMembership.mockResolvedValue(false);
  createWithOwner.mockImplementation(async ({ name }) =>
    storedHousehold({ name })
  );
  findCurrentForUser.mockResolvedValue(null);
});

describe("createHousehold — main success scenario", () => {
  it("creates the household and returns its public fields", async () => {
    const household = await createHousehold({
      userId: USER_ID,
      name: "Apartment 4B",
    });

    expect(household).toEqual({
      id: expect.any(String),
      name: "Apartment 4B",
      createdAt: expect.any(Date),
      role: "OWNER",
    });
  });

  it("makes the creator the OWNER (FR-05, UC-03 step 5)", async () => {
    const household = await createHousehold({
      userId: USER_ID,
      name: "Apartment 4B",
    });

    expect(createWithOwner).toHaveBeenCalledWith({
      name: "Apartment 4B",
      ownerUserId: USER_ID,
    });
    expect(household.role).toBe("OWNER");
  });

  it("trims the name before storing it", async () => {
    await createHousehold({ userId: USER_ID, name: "  Apartment 4B  " });

    expect(createWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Apartment 4B" })
    );
  });

  it("accepts a name at the 100 character limit", async () => {
    const name = "a".repeat(100);

    await expect(
      createHousehold({ userId: USER_ID, name })
    ).resolves.toMatchObject({ name });
  });
});

describe("createHousehold — extension 3a, invalid name", () => {
  it.each([
    ["empty", ""],
    ["only whitespace", "   "],
    ["missing", undefined],
    ["not a string", 42],
  ])("rejects a name that is %s", async (_label, name) => {
    await expect(createHousehold({ userId: USER_ID, name })).rejects.toThrow(
      ValidationError
    );
  });

  it("rejects a name longer than 100 characters after trim", async () => {
    await expect(
      createHousehold({ userId: USER_ID, name: "a".repeat(101) })
    ).rejects.toThrow(ValidationError);
  });

  it("reports the failure against the name field", async () => {
    await expect(
      createHousehold({ userId: USER_ID, name: "" })
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      status: 400,
      fields: { name: expect.any(String) },
    });
  });

  it("creates nothing when the name is invalid", async () => {
    await expect(
      createHousehold({ userId: USER_ID, name: "" })
    ).rejects.toThrow();

    expect(createWithOwner).not.toHaveBeenCalled();
  });

  it("does not check membership before validating the name", async () => {
    await expect(
      createHousehold({ userId: USER_ID, name: "" })
    ).rejects.toThrow();

    expect(hasMembership).not.toHaveBeenCalled();
  });
});

describe("createHousehold — extension 1a, already in a household", () => {
  beforeEach(() => {
    hasMembership.mockResolvedValue(true);
  });

  it("rejects the request with ALREADY_IN_HOUSEHOLD", async () => {
    await expect(
      createHousehold({ userId: USER_ID, name: "Apartment 4B" })
    ).rejects.toThrow(AlreadyInHouseholdError);
  });

  it("maps to 409 per the contract's error catalog", async () => {
    await expect(
      createHousehold({ userId: USER_ID, name: "Apartment 4B" })
    ).rejects.toMatchObject({
      code: "ALREADY_IN_HOUSEHOLD",
      status: 409,
    });
  });

  it("creates no household", async () => {
    await expect(
      createHousehold({ userId: USER_ID, name: "Apartment 4B" })
    ).rejects.toThrow();

    expect(createWithOwner).not.toHaveBeenCalled();
  });

  it("checks membership for the requesting user", async () => {
    await expect(
      createHousehold({ userId: USER_ID, name: "Apartment 4B" })
    ).rejects.toThrow();

    expect(hasMembership).toHaveBeenCalledWith(USER_ID);
  });
});

describe("getCurrentHousehold", () => {
  it("returns the household with the requester's role", async () => {
    findCurrentForUser.mockResolvedValue(storedHousehold({ role: "MEMBER" }));

    await expect(getCurrentHousehold(USER_ID)).resolves.toEqual({
      id: expect.any(String),
      name: "Apartment 4B",
      createdAt: expect.any(Date),
      role: "MEMBER",
    });
  });

  it("returns null when the user belongs to no household", async () => {
    findCurrentForUser.mockResolvedValue(null);

    await expect(getCurrentHousehold(USER_ID)).resolves.toBeNull();
  });
});

const HOUSEHOLD_ID = "clx1111111111111111111111";

describe("requireMembership", () => {
  it("returns the requester's role when they are a member", async () => {
    findRole.mockResolvedValue("MEMBER");

    await expect(requireMembership(USER_ID, HOUSEHOLD_ID)).resolves.toBe(
      "MEMBER"
    );
    expect(findRole).toHaveBeenCalledWith(USER_ID, HOUSEHOLD_ID);
  });

  it("returns OWNER for the household's owner", async () => {
    findRole.mockResolvedValue("OWNER");

    await expect(requireMembership(USER_ID, HOUSEHOLD_ID)).resolves.toBe(
      "OWNER"
    );
  });

  it("rejects a non-member with HOUSEHOLD_NOT_FOUND (contract decision 5)", async () => {
    findRole.mockResolvedValue(null);

    await expect(
      requireMembership(USER_ID, HOUSEHOLD_ID)
    ).rejects.toThrow(HouseholdNotFoundError);
  });

  it("maps to 404, not 403, so another household's existence is not confirmed", async () => {
    findRole.mockResolvedValue(null);

    await expect(
      requireMembership(USER_ID, HOUSEHOLD_ID)
    ).rejects.toMatchObject({ code: "HOUSEHOLD_NOT_FOUND", status: 404 });
  });
});

describe("listMembers", () => {
  const OWNER = {
    userId: USER_ID,
    name: "Agustin",
    role: "OWNER" as const,
    joinedAt: new Date("2026-09-28T00:00:00Z"),
  };
  const ROOMMATE = {
    userId: "clx2222222222222222222222",
    name: "Orlando",
    role: "MEMBER" as const,
    joinedAt: new Date("2026-09-29T00:00:00Z"),
  };

  it("returns every member in the order the repository gives them", async () => {
    listMembers.mockResolvedValue([OWNER, ROOMMATE]);

    await expect(listHouseholdMembers(HOUSEHOLD_ID)).resolves.toEqual([
      OWNER,
      ROOMMATE,
    ]);
    expect(listMembers).toHaveBeenCalledWith(HOUSEHOLD_ID);
  });

  it("returns exactly the MemberPublic fields, with no email", async () => {
    listMembers.mockResolvedValue([
      { ...OWNER, email: "agustin@crimson.ua.edu" } as typeof OWNER,
    ]);

    const [member] = await listHouseholdMembers(HOUSEHOLD_ID);

    expect(Object.keys(member).sort()).toEqual(
      ["joinedAt", "name", "role", "userId"].sort()
    );
  });
});
