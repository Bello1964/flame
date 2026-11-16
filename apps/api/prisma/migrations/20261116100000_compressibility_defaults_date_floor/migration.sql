-- Organisation-level compressibility defaults, record Z provenance, and the earliest
-- allowed activity date. See docs/architecture/ARCHITECTURAL_WORKFLOW.md §4.1.
-- Wrapped in a transaction so it applies completely or not at all.
BEGIN;

-- AlterTable
ALTER TABLE "activity_records" ADD COLUMN "compressibilitySource" VARCHAR(500);

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN "defaultCompressibilitySource" VARCHAR(500),
ADD COLUMN "defaultZReference" DECIMAL(12,6),
ADD COLUMN "defaultZSource" DECIMAL(12,6);

-- Default Z factors travel as a pair with their source, and are positive.
ALTER TABLE "organisations"
  ADD CONSTRAINT "organisations_default_z_check" CHECK (
    ("defaultZSource" IS NULL) = ("defaultZReference" IS NULL)
    AND ("defaultZSource" IS NULL) = ("defaultCompressibilitySource" IS NULL)
    AND ("defaultZSource" IS NULL OR "defaultZSource" > 0)
    AND ("defaultZReference" IS NULL OR "defaultZReference" > 0)
  );

ALTER TABLE "activity_records"
  -- A Z source only accompanies Z factors.
  ADD CONSTRAINT "activity_records_compressibility_source_check" CHECK (
    "compressibilitySource" IS NULL OR "zSource" IS NOT NULL
  ),
  -- Earliest allowed activity date (product owner, 2026-11-16).
  ADD CONSTRAINT "activity_records_date_floor_check" CHECK (
    "periodStart" >= DATE '2000-01-01'
  );

COMMIT;
