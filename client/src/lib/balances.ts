import type { Balance, Settlement } from "./api";
import { formatCents } from "./money";

/**
 * How balances and payments read on screen. Pure, so the direction of every
 * sentence — the part that is easiest to get backwards — is tested.
 *
 * Direction is always carried by the words ("owes you", "you owe"), never by
 * colour or sign alone.
 */

export type BalanceDirection = "owes-you" | "you-owe" | "settled";

export function describeBalance(balance: Balance): {
  text: string;
  direction: BalanceDirection;
} {
  if (balance.netCents > 0) {
    return {
      text: `${balance.name} owes you ${formatCents(balance.netCents)}`,
      direction: "owes-you",
    };
  }
  if (balance.netCents < 0) {
    return {
      text: `You owe ${balance.name} ${formatCents(-balance.netCents)}`,
      direction: "you-owe",
    };
  }
  return { text: `You and ${balance.name} are settled up`, direction: "settled" };
}

/**
 * The settlement that would pay off this balance (UC-08 step 3): whoever owes
 * pays whoever is owed, the full outstanding amount by default. Null when
 * there is nothing to pay.
 */
export function paymentFor(
  balance: Balance,
  currentUserId: string
): { fromUserId: string; toUserId: string; amountCents: number; label: string } | null {
  if (balance.netCents > 0) {
    return {
      fromUserId: balance.userId,
      toUserId: currentUserId,
      amountCents: balance.netCents,
      label: `Record that ${balance.name} paid you`,
    };
  }
  if (balance.netCents < 0) {
    return {
      fromUserId: currentUserId,
      toUserId: balance.userId,
      amountCents: -balance.netCents,
      label: `Record that you paid ${balance.name}`,
    };
  }
  return null;
}

/** "Maya paid you $18.33", "You paid Sam $12.00", "Maya paid Sam $5.00". */
export function describeSettlement(settlement: Settlement, currentUserId: string): string {
  const from = settlement.from.userId === currentUserId ? "You" : settlement.from.name;
  const to = settlement.to.userId === currentUserId ? "you" : settlement.to.name;
  return `${from} paid ${to} ${formatCents(settlement.amountCents)}`;
}
