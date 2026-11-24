-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "widget_config" JSONB,
ADD COLUMN     "widget_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "widget_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "projects_widget_key_key" ON "projects"("widget_key");

