-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SplitMethod" AS ENUM ('EQUAL', 'CUSTOM', 'PERCENTAGE');

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "households" (
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "households_pkey" PRIMARY KEY ("household_id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "membership_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("membership_id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "invitation_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("invitation_id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "expense_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "total_amount_cents" INTEGER NOT NULL,
    "paid_by_user_id" TEXT NOT NULL,
    "split_method" "SplitMethod" NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("expense_id")
);

-- CreateTable
CREATE TABLE "expense_shares" (
    "expense_share_id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_owed_cents" INTEGER NOT NULL,
    "percent_basis_points" INTEGER,

    CONSTRAINT "expense_shares_pkey" PRIMARY KEY ("expense_share_id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "settlement_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("settlement_id")
);

-- CreateTable
CREATE TABLE "chores" (
    "chore_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigned_user_id" TEXT,
    "due_date" TIMESTAMP(3),
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chores_pkey" PRIMARY KEY ("chore_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_household_id_idx" ON "memberships"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_household_id_key" ON "memberships"("user_id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_household_id_idx" ON "invitations"("household_id");

-- CreateIndex
CREATE INDEX "expenses_household_id_expense_date_idx" ON "expenses"("household_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_paid_by_user_id_idx" ON "expenses"("paid_by_user_id");

-- CreateIndex
CREATE INDEX "expense_shares_user_id_idx" ON "expense_shares"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_shares_expense_id_user_id_key" ON "expense_shares"("expense_id", "user_id");

-- CreateIndex
CREATE INDEX "settlements_household_id_settled_at_idx" ON "settlements"("household_id", "settled_at");

-- CreateIndex
CREATE INDEX "settlements_from_user_id_idx" ON "settlements"("from_user_id");

-- CreateIndex
CREATE INDEX "settlements_to_user_id_idx" ON "settlements"("to_user_id");

-- CreateIndex
CREATE INDEX "chores_household_id_is_complete_due_date_idx" ON "chores"("household_id", "is_complete", "due_date");

-- CreateIndex
CREATE INDEX "chores_assigned_user_id_idx" ON "chores"("assigned_user_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("expense_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chores" ADD CONSTRAINT "chores_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("household_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chores" ADD CONSTRAINT "chores_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
