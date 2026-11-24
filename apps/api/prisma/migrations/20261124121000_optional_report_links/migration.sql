-- Reports from the extension are not tied to a recording session, so these links are optional.
ALTER TABLE "bug_reports" ALTER COLUMN "session_id" DROP NOT NULL,
ALTER COLUMN "workspace_id" DROP NOT NULL,
ALTER COLUMN "reporter_id" DROP NOT NULL;
