-- CreateTable
CREATE TABLE "rate_counters" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "error_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT,
    "method" TEXT,
    "status" INTEGER,
    "user_id" TEXT,
    "workspace_id" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_events_created_at_idx" ON "error_events"("created_at");

-- CreateIndex
CREATE INDEX "error_events_fingerprint_created_at_idx" ON "error_events"("fingerprint", "created_at");
