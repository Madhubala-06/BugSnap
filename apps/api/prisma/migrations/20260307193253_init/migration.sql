-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('RECORDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('CONSOLE', 'NETWORK', 'CLICK', 'ERROR', 'NAVIGATION', 'INPUT');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'RECORDING',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "url" TEXT,
    "duration" INTEGER,
    "size" INTEGER,
    "mime_type" TEXT DEFAULT 'video/webm',
    "thumbnail_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" "LogType" NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "data" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "steps_to_reproduce" TEXT[],
    "expected_result" TEXT,
    "actual_result" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "ai_summary" TEXT,
    "ai_root_cause" TEXT,
    "ai_suggestions" TEXT[],
    "url" TEXT,
    "browser_info" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_session_id_key" ON "recordings"("session_id");

-- CreateIndex
CREATE INDEX "session_logs_session_id_type_idx" ON "session_logs"("session_id", "type");

-- CreateIndex
CREATE INDEX "session_logs_session_id_timestamp_idx" ON "session_logs"("session_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "bug_reports_session_id_key" ON "bug_reports"("session_id");

-- CreateIndex
CREATE INDEX "bug_reports_workspace_id_status_idx" ON "bug_reports"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "bug_reports_workspace_id_severity_idx" ON "bug_reports"("workspace_id", "severity");

-- CreateIndex
CREATE INDEX "bug_reports_reporter_id_idx" ON "bug_reports"("reporter_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
