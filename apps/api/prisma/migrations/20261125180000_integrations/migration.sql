-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secret_enc" TEXT,
    "external_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_links" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integrations_provider_external_id_idx" ON "integrations"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_workspace_id_provider_key" ON "integrations"("workspace_id", "provider");

-- CreateIndex
CREATE INDEX "report_links_report_id_idx" ON "report_links"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_links_provider_external_id_key" ON "report_links"("provider", "external_id");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_links" ADD CONSTRAINT "report_links_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

