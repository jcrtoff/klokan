-- Add authorized: existing brokers stay authorized, new default is false
ALTER TABLE "brokers" ADD COLUMN "authorized" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "brokers" ALTER COLUMN "authorized" SET DEFAULT false;

-- Add manager_id self-referential FK
ALTER TABLE "brokers" ADD COLUMN "manager_id" TEXT;
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
