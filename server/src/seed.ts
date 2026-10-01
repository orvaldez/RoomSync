/**
 * Seed data for review and demonstration.
 *
 * Creates one household with two members and two expenses, so a reviewer can
 * log in and see real balances without registering accounts and typing in
 * expenses first.
 *
 * Run with `npm run db:seed` from `server/`. Safe to run twice: it looks for
 * the seed household first and stops if it is already there, so it never
 * duplicates rows or overwrites anything a reviewer entered by hand.
 *
 * The shares are calculated by `splitExpense`, the same function the API uses
 * (UC-06). Hard-coding the cents here would let the seed drift from the
 * application's own arithmetic, which is the one thing SC-04 cares about.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { getPrisma } from "./repositories/prisma";
import { BCRYPT_COST } from "./services/auth.service";
import { splitExpense } from "./services/split.service";

/** Documented in the README so a reviewer can sign in as either member. */
const PASSWORD = "roomsync123";

const HOUSEHOLD_NAME = "Apartment 41";

const PEOPLE = [
  { name: "Orlando Rodriguez Valdez", email: "orlando@roomsync.test" },
  { name: "Agustin Lemuz-Juarez", email: "agustin@roomsync.test" },
] as const;

async function main(): Promise<void> {
  const prisma = getPrisma();

  const existing = await prisma.household.findFirst({
    where: { name: HOUSEHOLD_NAME },
    select: { id: true },
  });

  if (existing) {
    console.log(
      `Seed household "${HOUSEHOLD_NAME}" already exists — nothing to do.\n` +
        "Run `npm run db:reset` first if you want a clean database."
    );
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_COST);

  // upsert rather than create: the accounts may already exist from a previous
  // seed whose household was deleted, and email is unique.
  const [owner, member] = await Promise.all(
    PEOPLE.map((person) =>
      prisma.user.upsert({
        where: { email: person.email },
        update: {},
        create: { name: person.name, email: person.email, passwordHash },
        select: { id: true },
      })
    )
  );

  const household = await prisma.household.create({
    data: {
      name: HOUSEHOLD_NAME,
      memberships: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: member.id, role: "MEMBER" },
        ],
      },
    },
    select: { id: true },
  });

  // Participants go in join order, matching what the API sends: remainder
  // cents are handed out in request order, so the order decides who absorbs
  // an odd cent.
  const participants = [{ userId: owner.id }, { userId: member.id }];

  const expenses = [
    {
      description: "Groceries",
      totalAmountCents: 8_451, // odd cent on purpose: 4226 / 4225
      expenseDate: "2026-09-24",
      paidByUserId: owner.id,
      splitMethod: "EQUAL" as const,
      participants,
    },
    {
      description: "Internet",
      totalAmountCents: 7_000,
      expenseDate: "2026-09-27",
      paidByUserId: member.id,
      splitMethod: "PERCENTAGE" as const,
      participants: [
        { userId: owner.id, percentBasisPoints: 6_000 },
        { userId: member.id, percentBasisPoints: 4_000 },
      ],
    },
  ];

  for (const expense of expenses) {
    const shares = splitExpense({
      totalAmountCents: expense.totalAmountCents,
      splitMethod: expense.splitMethod,
      participants: expense.participants,
    });

    await prisma.expense.create({
      data: {
        householdId: household.id,
        description: expense.description,
        totalAmountCents: expense.totalAmountCents,
        expenseDate: new Date(`${expense.expenseDate}T00:00:00.000Z`),
        paidByUserId: expense.paidByUserId,
        splitMethod: expense.splitMethod,
        shares: {
          create: shares.map((share) => ({
            userId: share.userId,
            amountOwedCents: share.amountOwedCents,
            percentBasisPoints: share.percentBasisPoints,
          })),
        },
      },
    });
  }

  console.log(`Seeded "${HOUSEHOLD_NAME}" with ${PEOPLE.length} members and ${expenses.length} expenses.`);
  console.log("Sign in with either:");
  for (const person of PEOPLE) {
    console.log(`  ${person.email}  /  ${PASSWORD}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    // Non-zero exit so `npm run db:seed` fails loudly in a script or CI step
    // rather than looking like it worked.
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
