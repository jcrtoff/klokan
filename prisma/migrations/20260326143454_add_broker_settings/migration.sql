-- CreateTable
CREATE TABLE "broker_settings" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',

    CONSTRAINT "broker_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "broker_settings_broker_id_key" ON "broker_settings"("broker_id");

-- AddForeignKey
ALTER TABLE "broker_settings" ADD CONSTRAINT "broker_settings_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
