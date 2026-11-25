-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "pro_interest_at" TIMESTAMP(3);
