-- AlterTable
ALTER TABLE "bug_reports" ADD COLUMN     "ai_status" TEXT,
ADD COLUMN     "error_signature" TEXT,
ADD COLUMN     "share_token" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "ai_period" TEXT,
ADD COLUMN     "ai_used" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "github_repo" TEXT,
ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_workspace_id_idx" ON "api_keys"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "bug_reports_share_token_key" ON "bug_reports"("share_token");

-- CreateIndex
CREATE INDEX "bug_reports_workspace_id_error_signature_idx" ON "bug_reports"("workspace_id", "error_signature");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

