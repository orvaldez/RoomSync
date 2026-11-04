-- #90: record who entered each expense and settlement (threat model M4).
-- Nullable, with no backfill: who entered a row recorded before this column
-- existed can't be known, and a guess would be wrong for every expense entered
-- on another member's behalf (docs/process/ai-assisted-workflow.md, entry 3).

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "created_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "settlements" ADD COLUMN     "created_by_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
