import * as householdRepository from "../repositories/household.repository";
import { AlreadyInHouseholdError, ValidationError } from "./errors";
import { validateHouseholdName } from "./validation";

/**
 * Household creation and lookup, per UC-03.
 *
 * The caller supplies `userId` from the authenticated session; this layer
 * knows nothing about how that was established (no `req`, no cookies), per
 * ADR-001.
 */

/** A household as the rest of the application sees one, matching the API
 *  contract's `HouseholdPublic` (Section 2). `role` is the requester's own. */
export type PublicHousehold = {
  id: string;
  name: string;
  createdAt: Date;
  role: householdRepository.MembershipRole;
};

export type CreateHouseholdInput = {
  userId: string;
  name?: unknown;
};

function toPublicHousehold(
  household: householdRepository.HouseholdWithRole
): PublicHousehold {
  return {
    id: household.id,
    name: household.name,
    createdAt: household.createdAt,
    role: household.role,
  };
}

export async function createHousehold(
  input: CreateHouseholdInput
): Promise<PublicHousehold> {
  const nameError = validateHouseholdName(input.name);
  if (nameError) {
    // One field, but the same `fields` shape as registration, so the client
    // renders every form error the same way (contract Section 1).
    throw new ValidationError({ name: nameError });
  }

  // UC-03 extension 1a: creation is not offered to someone who already has a
  // household, and the server checks it rather than trusting the client to
  // hide the button (NFR-07).
  if (await householdRepository.hasMembership(input.userId)) {
    throw new AlreadyInHouseholdError();
  }

  const name = (input.name as string).trim();

  const household = await householdRepository.createWithOwner({
    name,
    ownerUserId: input.userId,
  });

  return toPublicHousehold(household);
}

/**
 * The requester's household, or null when they have none.
 *
 * Having no household is a normal state, not an error — the client uses the
 * null to show the create-or-join screen (UC-02 6a, UC-10 2a).
 */
export async function getCurrentHousehold(
  userId: string
): Promise<PublicHousehold | null> {
  const household = await householdRepository.findCurrentForUser(userId);
  return household ? toPublicHousehold(household) : null;
}
