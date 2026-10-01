import * as householdRepository from "../repositories/household.repository";
import * as ledgerRepository from "../repositories/ledger.repository";
import { netOwed } from "./balance.service";
import {
  ExceedsBalanceError,
  MemberNotInHouseholdError,
  SameMemberError,
  ValidationError,
} from "./errors";
import { validateAmountCents, validateSettlementNote } from "./validation";

/**
 * Recording that a debt was paid outside the app (UC-08). RoomSync moves no
 * money; a settlement is a record that money moved elsewhere, and it reduces
 * the derived balance between two members.
 */

/** The request body (contract Section 4, Settlements). */
export type SettlementInput = {
  fromUserId?: unknown;
  toUserId?: unknown;
  amountCents?: unknown;
  note?: unknown;
};

/** The contract's `SettlementPublic` (Section 2). */
export type PublicSettlement = {
  id: string;
  from: { userId: string; name: string };
  to: { userId: string; name: string };
  amountCents: number;
  note: string | null;
  settledAt: Date;
};

/**
 * Record that `fromUserId` paid `toUserId` (UC-08 steps 4-5).
 *
 * `from` is the member who paid off a debt and `to` the member who was owed.
 * The amount may not exceed what `from` owes `to` at the moment of writing
 * (4a, 4e); if `from` owes `to` nothing, every amount is refused.
 */
export async function createSettlement(
  householdId: string,
  input: SettlementInput
): Promise<PublicSettlement> {
  const fields: Record<string, string> = {};

  const amountError = validateAmountCents(input.amountCents);
  if (amountError) fields.amountCents = amountError;

  const noteError = validateSettlementNote(input.note);
  if (noteError) fields.note = noteError;

  if (Object.keys(fields).length > 0) {
    throw new ValidationError(fields);
  }

  const { fromUserId, toUserId } = input;
  const amountCents = input.amountCents as number;

  // The contract lists only amountCents and note among the VALIDATION_FAILED
  // fields, so a missing or malformed member id is simply not a member (4d).
  if (typeof fromUserId !== "string" || typeof toUserId !== "string") {
    throw new MemberNotInHouseholdError();
  }

  if (fromUserId === toUserId) {
    throw new SameMemberError();
  }

  const [fromRole, toRole] = await Promise.all([
    householdRepository.findRole(fromUserId, householdId),
    householdRepository.findRole(toUserId, householdId),
  ]);
  if (!fromRole || !toRole) {
    throw new MemberNotInHouseholdError();
  }

  const settlement = await ledgerRepository.createSettlementChecked(
    {
      householdId,
      fromUserId,
      toUserId,
      amountCents,
      note: toNote(input.note),
    },
    // Runs inside the write's transaction, against the ledger as it is then.
    (entries) => {
      if (amountCents > netOwed(toUserId, fromUserId, entries)) {
        throw new ExceedsBalanceError();
      }
    }
  );

  return toPublicSettlement(settlement);
}

/** Every settlement in the household, newest first, including fully paid-off ones. */
export async function listSettlements(householdId: string): Promise<PublicSettlement[]> {
  const settlements = await ledgerRepository.listSettlements(householdId);
  return settlements.map(toPublicSettlement);
}

function toNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toPublicSettlement(settlement: ledgerRepository.SettlementRecord): PublicSettlement {
  return {
    id: settlement.id,
    from: settlement.from,
    to: settlement.to,
    amountCents: settlement.amountCents,
    note: settlement.note,
    settledAt: settlement.settledAt,
  };
}
