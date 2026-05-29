-- CreateTable
CREATE TABLE "modular_map_layouts" (
  "map_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "modular_map_layouts_pkey" PRIMARY KEY ("map_id")
);
