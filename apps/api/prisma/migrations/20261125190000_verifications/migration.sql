-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "repo" TEXT,
    "pr_number" INTEGER,
    "pr_url" TEXT,
    "commit_sha" TEXT,
    "run_url" TEXT,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verifications_report_id_created_at_idx" ON "verifications"("report_id", "created_at");

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
