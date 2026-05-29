ALTER TABLE "users"
ADD COLUMN "siiau_snapshot" JSONB,
ADD COLUMN "siiau_snapshot_status" TEXT,
ADD COLUMN "siiau_snapshot_error" TEXT,
ADD COLUMN "siiau_snapshot_requested_at" TIMESTAMP(3),
ADD COLUMN "siiau_snapshot_updated_at" TIMESTAMP(3);
