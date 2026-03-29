-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "widget_id" TEXT,
    "given_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "discovered_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "affected_sessions" TEXT[],
    "risk_level" TEXT NOT NULL,
    "reported_to_cai" BOOLEAN NOT NULL DEFAULT false,
    "reported_at" TIMESTAMP(3),
    "actions_taken" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by" TEXT NOT NULL,

    CONSTRAINT "deletion_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
