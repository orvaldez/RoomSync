-- US-12 (#60): editing and soft-deleting an expense (analysis-model.md §8.1).

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_user_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- An existing expense has never been edited, so it was last updated when it
-- was created, not when this migration ran.
UPDATE "expenses" SET "updated_at" = "created_at";

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
