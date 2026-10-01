import { netOwed } from "./services/balance.service";
import { splitExpense, type SplitMethod } from "./services/split.service";
import type { Debt, LedgerEntries } from "./repositories/ledger.repository";

/**
 * What the demonstration household contains (#16), as plain data.
 *
 * Kept apart from `seed.ts`, which writes it, so the data can be checked
 * without a database: `seed-data.test.ts` proves every expense splits, every
 * settlement is no more than was owed when it was made, and every screen has
 * something on it. The seed runs the same check before writing anything.
 *
 * Dates are offsets from the day the seed runs, so the chores are always
 * "due tomorrow" or "overdue" rather than drifting into the past.
 */

export const DEMO_PASSWORD = "roomsync123";

export const HOUSEHOLD_NAME = "Apartment 41";

export type PersonKey = "orlando" | "agustin" | "marcus" | "priya";

/** In join order: the first is the owner. */
export const PEOPLE: readonly {
  key: PersonKey;
  name: string;
  email: string;
  role: "OWNER" | "MEMBER";
}[] = [
  { key: "orlando", name: "Orlando Rodriguez Valdez", email: "orlando@roomsync.test", role: "OWNER" },
  { key: "agustin", name: "Agustin Lemuz-Juarez", email: "agustin@roomsync.test", role: "MEMBER" },
  { key: "marcus", name: "Marcus Lee", email: "marcus@roomsync.test", role: "MEMBER" },
  { key: "priya", name: "Priya Shah", email: "priya@roomsync.test", role: "MEMBER" },
];

export type SeedExpense = {
  description: string;
  totalAmountCents: number;
  daysAgo: number;
  paidBy: PersonKey;
  splitMethod: SplitMethod;
  /** In join order, as the client sends them: remainder cents go in this order. */
  participants: { person: PersonKey; amountCents?: number; percentBasisPoints?: number }[];
};

export type SeedSettlement = {
  from: PersonKey;
  to: PersonKey;
  amountCents: number;
  daysAgo: number;
  note: string | null;
};

export type SeedChore = {
  title: string;
  description: string | null;
  assignee: PersonKey | null;
  /** Days from today; negative is overdue. Null for no due date. */
  dueInDays: number | null;
  /** Null while outstanding. */
  completedDaysAgo: number | null;
};

const everyone = (extra: Partial<Record<PersonKey, number>> = {}, key?: "amountCents" | "percentBasisPoints") =>
  PEOPLE.map((p) => (key ? { person: p.key, [key]: extra[p.key] } : { person: p.key }));

export const EXPENSES: readonly SeedExpense[] = [
  {
    // An odd cent on purpose: 8451 / 4 leaves 3 cents for the first three.
    description: "Groceries",
    totalAmountCents: 8_451,
    daysAgo: 9,
    paidBy: "orlando",
    splitMethod: "EQUAL",
    participants: everyone(),
  },
  {
    description: "Internet",
    totalAmountCents: 7_000,
    daysAgo: 8,
    paidBy: "agustin",
    splitMethod: "PERCENTAGE",
    participants: everyone({ orlando: 3_000, agustin: 3_000, marcus: 2_000, priya: 2_000 }, "percentBasisPoints"),
  },
  {
    description: "Electricity",
    totalAmountCents: 12_345,
    daysAgo: 6,
    paidBy: "priya",
    splitMethod: "CUSTOM",
    participants: everyone({ orlando: 4_000, agustin: 3_000, marcus: 2_500, priya: 2_845 }, "amountCents"),
  },
  {
    // Not everyone takes part: Priya was out.
    description: "Pizza night",
    totalAmountCents: 3_600,
    daysAgo: 4,
    paidBy: "marcus",
    splitMethod: "EQUAL",
    participants: [{ person: "orlando" }, { person: "agustin" }, { person: "marcus" }],
  },
  {
    description: "Paper towels and dish soap",
    totalAmountCents: 1_899,
    daysAgo: 2,
    paidBy: "orlando",
    splitMethod: "EQUAL",
    participants: everyone(),
  },
];

export const SETTLEMENTS: readonly SeedSettlement[] = [
  // Pays Marcus's balance with Orlando off exactly, so one pair reads "settled up".
  { from: "marcus", to: "orlando", amountCents: 1_388, daysAgo: 1, note: "Venmo" },
  // A partial payment: Agustin still owes Priya afterwards.
  { from: "agustin", to: "priya", amountCents: 1_000, daysAgo: 1, note: "Cash" },
];

export const CHORES: readonly SeedChore[] = [
  { title: "Take out the trash", description: "Bins go to the curb Thursday night.", assignee: "agustin", dueInDays: 1, completedDaysAgo: null },
  { title: "Clean the bathroom", description: null, assignee: "marcus", dueInDays: -2, completedDaysAgo: null },
  { title: "Vacuum the living room", description: null, assignee: "orlando", dueInDays: 4, completedDaysAgo: null },
  { title: "Restock toilet paper", description: null, assignee: "priya", dueInDays: 3, completedDaysAgo: null },
  { title: "Buy a new shower curtain", description: null, assignee: null, dueInDays: null, completedDaysAgo: null },
  { title: "Wipe down the kitchen", description: null, assignee: "priya", dueInDays: -1, completedDaysAgo: 1 },
  { title: "Water the plants", description: null, assignee: "agustin", dueInDays: -3, completedDaysAgo: 3 },
];

/**
 * Everything wrong with the plan, or an empty list. Rebuilds the ledger in
 * the order things happened and checks each settlement against what was owed
 * at that moment, the same rule `POST /settlements` enforces (UC-08 4a).
 */
export function seedPlanProblems(): string[] {
  const problems: string[] = [];
  const debts: Debt[] = [];

  for (const expense of EXPENSES) {
    try {
      const shares = splitExpense({
        totalAmountCents: expense.totalAmountCents,
        splitMethod: expense.splitMethod,
        participants: expense.participants.map(({ person, ...rest }) => ({ userId: person, ...rest })),
      });
      for (const share of shares) {
        if (share.userId !== expense.paidBy) {
          debts.push({ debtorId: share.userId, creditorId: expense.paidBy, amountCents: share.amountOwedCents });
        }
      }
    } catch (error) {
      problems.push(`Expense "${expense.description}" does not split: ${(error as Error).message}`);
    }
  }

  const entries: LedgerEntries = { debts, payments: [] };
  const byTime = [...SETTLEMENTS].sort((a, b) => b.daysAgo - a.daysAgo);

  for (const settlement of byTime) {
    const owed = netOwed(settlement.to, settlement.from, entries);
    if (settlement.amountCents > owed) {
      problems.push(
        `${settlement.from} pays ${settlement.to} ${settlement.amountCents} but owes only ${owed}`
      );
    }
    entries.payments.push({
      fromUserId: settlement.from,
      toUserId: settlement.to,
      amountCents: settlement.amountCents,
    });
  }

  for (const chore of CHORES) {
    if (chore.completedDaysAgo !== null && chore.completedDaysAgo < 0) {
      problems.push(`Chore "${chore.title}" is completed in the future`);
    }
  }

  return problems;
}

/** `YYYY-MM-DD` for the local calendar day `offsetDays` from `now`. */
export function calendarDate(now: Date, offsetDays: number): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** An instant `daysAgo` days before `now` at a fixed local hour, so activity has a stable order. */
export function instantDaysAgo(now: Date, daysAgo: number, hour = 18): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour);
}
