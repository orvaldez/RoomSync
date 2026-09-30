import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked before importing the service, so the real repositories — and through
// them the Prisma client — are never loaded. These tests need no database.
vi.mock("../repositories/invitation.repository", () => ({
  create: vi.fn(),
  findByToken: vi.fn(),
  markExpired: vi.fn(),
  acceptIntoHousehold: vi.fn(),
}));

vi.mock("../repositories/household.repository", () => ({
  createWithOwner: vi.fn(),
  findCurrentForUser: vi.fn(),
  hasMembership: vi.fn(),
  findRole: vi.fn(),
  listMembers: vi.fn(),
}));

import * as invitationRepository from "../repositories/invitation.repository";
import * as householdRepository from "../repositories/household.repository";
import { UniqueConstraintError } from "../repositories/errors";
import {
  INVITATION_LIFETIME_MS,
  acceptInvitation,
  createInvitation,
  previewInvitation,
} from "./invitation.service";
import {
  AlreadyInHouseholdError,
  InvitationExpiredError,
  InvitationInvalidError,
  NotHouseholdOwnerError,
} from "./errors";

const create = vi.mocked(invitationRepository.create);
const findByToken = vi.mocked(invitationRepository.findByToken);
const markExpired = vi.mocked(invitationRepository.markExpired);
const acceptIntoHousehold = vi.mocked(invitationRepository.acceptIntoHousehold);
const findRole = vi.mocked(householdRepository.findRole);
const hasMembership = vi.mocked(householdRepository.hasMembership);

const HOUSEHOLD_ID = "clxHOUSEHOLD0000000000000";
const RECIPIENT = "clxRECIPIENT000000000000";
const TOKEN = "a".repeat(43);

function invitation(
  overrides: Partial<invitationRepository.InvitationWithHousehold> = {}
): invitationRepository.InvitationWithHousehold {
  return {
    id: "clxINVITATION00000000000",
    householdId: HOUSEHOLD_ID,
    token: TOKEN,
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    household: {
      id: HOUSEHOLD_ID,
      name: "Apartment 4B",
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
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
  create.mockImplementation(async (input) => ({
    id: "clxINVITATION00000000000",
    householdId: input.householdId,
    token: input.token,
    status: "PENDING",
    expiresAt: input.expiresAt,
    createdAt: new Date(),
  }));
  findByToken.mockResolvedValue(invitation());
  findRole.mockResolvedValue(null);
  hasMembership.mockResolvedValue(false);
  acceptIntoHousehold.mockResolvedValue(true);
});

describe("createInvitation (UC-04 steps 1-3)", () => {
  it("creates a pending invitation for the owner's household", async () => {
    const created = await createInvitation(HOUSEHOLD_ID, "OWNER");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: HOUSEHOLD_ID })
    );
    expect(created.status).toBe("PENDING");
  });

  it("uses a 32-byte random token, base64url encoded", async () => {
    const { token } = await createInvitation(HOUSEHOLD_ID, "OWNER");

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never issues the same token twice", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i++) {
      tokens.add((await createInvitation(HOUSEHOLD_ID, "OWNER")).token);
    }

    expect(tokens.size).toBe(50);
  });

  it("expires seven days after creation (contract decision 1)", async () => {
    const before = Date.now();
    const { expiresAt } = await createInvitation(HOUSEHOLD_ID, "OWNER");

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + INVITATION_LIFETIME_MS);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + INVITATION_LIFETIME_MS);
  });

  it("rejects a member who is not the owner, creating nothing (UC-04 1a)", async () => {
    const error = await rejectionOf(createInvitation(HOUSEHOLD_ID, "MEMBER"));

    expect(error).toBeInstanceOf(NotHouseholdOwnerError);
    expect(error).toMatchObject({ code: "NOT_HOUSEHOLD_OWNER", status: 403 });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("previewInvitation (UC-04 steps 5-8)", () => {
  it("returns only the household name and expiry", async () => {
    const preview = await previewInvitation(TOKEN);

    expect(preview).toEqual({
      householdName: "Apartment 4B",
      expiresAt: expect.any(Date),
    });
  });

  it("answers an unknown token with INVITATION_INVALID (6a)", async () => {
    findByToken.mockResolvedValue(null);

    const error = await rejectionOf(previewInvitation("no-such-token"));

    expect(error).toMatchObject({ code: "INVITATION_INVALID", status: 404 });
  });

  it.each(["ACCEPTED", "REVOKED"] as const)(
    "answers a %s invitation exactly like an unknown one (6a, 6c)",
    async (status) => {
      findByToken.mockResolvedValue(invitation({ status }));

      await expect(previewInvitation(TOKEN)).rejects.toThrow(InvitationInvalidError);
    }
  );

  it("rejects an empty or missing token without a lookup", async () => {
    await expect(previewInvitation("")).rejects.toThrow(InvitationInvalidError);
    await expect(previewInvitation(undefined)).rejects.toThrow(InvitationInvalidError);
    expect(findByToken).not.toHaveBeenCalled();
  });

  it("reports an expired invitation and marks it EXPIRED (6b)", async () => {
    findByToken.mockResolvedValue(
      invitation({ expiresAt: new Date(Date.now() - 1000) })
    );

    const error = await rejectionOf(previewInvitation(TOKEN));

    expect(error).toBeInstanceOf(InvitationExpiredError);
    expect(error).toMatchObject({ code: "INVITATION_EXPIRED", status: 410 });
    expect(markExpired).toHaveBeenCalledWith("clxINVITATION00000000000");
  });

  it("reports an invitation already marked EXPIRED as expired", async () => {
    findByToken.mockResolvedValue(invitation({ status: "EXPIRED" }));

    await expect(previewInvitation(TOKEN)).rejects.toThrow(InvitationExpiredError);
    expect(markExpired).not.toHaveBeenCalled();
  });
});

describe("acceptInvitation (UC-04 steps 9-11)", () => {
  it("joins the household as a MEMBER", async () => {
    const household = await acceptInvitation(RECIPIENT, TOKEN);

    expect(acceptIntoHousehold).toHaveBeenCalledWith({
      invitationId: "clxINVITATION00000000000",
      userId: RECIPIENT,
      householdId: HOUSEHOLD_ID,
    });
    expect(household).toMatchObject({
      id: HOUSEHOLD_ID,
      name: "Apartment 4B",
      role: "MEMBER",
    });
  });

  it("rejects someone already in another household, adding nothing (9a)", async () => {
    hasMembership.mockResolvedValue(true);

    const error = await rejectionOf(acceptInvitation(RECIPIENT, TOKEN));

    expect(error).toBeInstanceOf(AlreadyInHouseholdError);
    expect(acceptIntoHousehold).not.toHaveBeenCalled();
  });

  it("succeeds without change for an existing member of this household (9b)", async () => {
    findRole.mockResolvedValue("MEMBER");

    const household = await acceptInvitation(RECIPIENT, TOKEN);

    expect(household.role).toBe("MEMBER");
    expect(acceptIntoHousehold).not.toHaveBeenCalled();
  });

  it("keeps the owner's role when the owner opens their own link (9b)", async () => {
    findRole.mockResolvedValue("OWNER");

    const household = await acceptInvitation(RECIPIENT, TOKEN);

    expect(household.role).toBe("OWNER");
  });

  it("treats a second click on an already-used link as 9b for the member who used it", async () => {
    findByToken.mockResolvedValue(invitation({ status: "ACCEPTED" }));
    findRole.mockResolvedValue("MEMBER");

    await expect(acceptInvitation(RECIPIENT, TOKEN)).resolves.toMatchObject({
      role: "MEMBER",
    });
  });

  it("rejects a used link for anyone else (6c)", async () => {
    findByToken.mockResolvedValue(invitation({ status: "ACCEPTED" }));

    await expect(acceptInvitation(RECIPIENT, TOKEN)).rejects.toThrow(
      InvitationInvalidError
    );
    expect(acceptIntoHousehold).not.toHaveBeenCalled();
  });

  it("rejects an expired invitation and marks it EXPIRED (6b)", async () => {
    findByToken.mockResolvedValue(
      invitation({ expiresAt: new Date(Date.now() - 1000) })
    );

    await expect(acceptInvitation(RECIPIENT, TOKEN)).rejects.toThrow(
      InvitationExpiredError
    );
    expect(markExpired).toHaveBeenCalled();
    expect(acceptIntoHousehold).not.toHaveBeenCalled();
  });

  it("rejects when someone else claimed the invitation first", async () => {
    acceptIntoHousehold.mockResolvedValue(false);

    await expect(acceptInvitation(RECIPIENT, TOKEN)).rejects.toThrow(
      InvitationInvalidError
    );
  });

  it("treats joining this household concurrently as 9b rather than an error", async () => {
    acceptIntoHousehold.mockRejectedValue(new UniqueConstraintError("membership"));

    await expect(acceptInvitation(RECIPIENT, TOKEN)).resolves.toMatchObject({
      role: "MEMBER",
    });
  });

  it("rejects an unknown token", async () => {
    findByToken.mockResolvedValue(null);

    await expect(acceptInvitation(RECIPIENT, "nope")).rejects.toThrow(
      InvitationInvalidError
    );
  });
});
