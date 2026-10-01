/**
 * Seed data for review and demonstration (#16).
 *
 * Creates one household of four members with expenses in all three split
 * methods, two settlements, and chores both outstanding and completed, so a
 * reviewer can sign in as any member and find every screen populated. What it
 * creates is in `seed-data.ts`.
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
import {
  CHORES,
  DEMO_PASSWORD,
  EXPENSES,
  HOUSEHOLD_NAME,
  PEOPLE,
  SETTLEMENTS,
  calendarDate,
  instantDaysAgo,
  seedPlanProblems,
  type PersonKey,
} from "./seed-data";

async function main(): Promise<void> {
  // The demo password is public in the README. Accounts with it must never
  // exist anywhere real.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV is production.");
  }

  const problems = seedPlanProblems();
  if (problems.length > 0) {
    throw new Error(`The seed plan is inconsistent:\n  ${problems.join("\n  ")}`);
  }

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

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);
  const now = new Date();

  // One transaction: a failure part-way leaves no half-built household that
  // the "already exists" check above would then refuse to repair.
  await prisma.$transaction(async (tx) => {
    const ids = {} as Record<PersonKey, string>;

    for (const person of PEOPLE) {
      // upsert rather than create: the accounts may already exist from a
      // previous seed whose household was deleted, and email is unique. The
      // password is reset so the README's credentials always work.
      const user = await tx.user.upsert({
        where: { email: person.email },
        update: { passwordHash },
        create: { name: person.name, email: person.email, passwordHash },
        select: { id: true },
      });
      ids[person.key] = user.id;
    }

    const household = await tx.household.create({
      data: { name: HOUSEHOLD_NAME },
      select: { id: true },
    });

    // One at a time, so joinedAt follows PEOPLE's order and the owner is first.
    for (const [index, person] of PEOPLE.entries()) {
      await tx.membership.create({
        data: {
          userId: ids[person.key],
          householdId: household.id,
          role: person.role,
          joinedAt: instantDaysAgo(now, 14, 9 + index),
        },
      });
    }

    for (const expense of EXPENSES) {
      const shares = splitExpense({
        totalAmountCents: expense.totalAmountCents,
        splitMethod: expense.splitMethod,
        participants: expense.participants.map(({ person, ...rest }) => ({
          userId: ids[person],
          ...rest,
        })),
      });

      await tx.expense.create({
        data: {
          householdId: household.id,
          description: expense.description,
          totalAmountCents: expense.totalAmountCents,
          expenseDate: new Date(`${calendarDate(now, -expense.daysAgo)}T00:00:00.000Z`),
          createdAt: instantDaysAgo(now, expense.daysAgo),
          paidByUserId: ids[expense.paidBy],
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

    for (const [index, settlement] of SETTLEMENTS.entries()) {
      await tx.settlement.create({
        data: {
          householdId: household.id,
          fromUserId: ids[settlement.from],
          toUserId: ids[settlement.to],
          amountCents: settlement.amountCents,
          note: settlement.note,
          settledAt: instantDaysAgo(now, settlement.daysAgo, 12 + index),
        },
      });
    }

    for (const chore of CHORES) {
      await tx.chore.create({
        data: {
          householdId: household.id,
          title: chore.title,
          description: chore.description,
          assignedUserId: chore.assignee ? ids[chore.assignee] : null,
          dueDate:
            chore.dueInDays === null
              ? null
              : new Date(`${calendarDate(now, chore.dueInDays)}T00:00:00.000Z`),
          isComplete: chore.completedDaysAgo !== null,
          completedAt:
            chore.completedDaysAgo === null ? null : instantDaysAgo(now, chore.completedDaysAgo, 10),
          createdAt: instantDaysAgo(now, 7),
        },
      });
    }
  });

  console.log(
    `Seeded "${HOUSEHOLD_NAME}": ${PEOPLE.length} members, ${EXPENSES.length} expenses, ` +
      `${SETTLEMENTS.length} settlements, ${CHORES.length} chores.`
  );
  console.log(`Sign in as any member with the password ${DEMO_PASSWORD}:`);
  for (const person of PEOPLE) {
    console.log(`  ${person.email}  (${person.role.toLowerCase()})`);
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
