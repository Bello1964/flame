-- Milestone 2: gas activity data. See docs/architecture/ARCHITECTURAL_WORKFLOW.md §4.1.
-- Prisma does not run migrations in a transaction; wrap explicitly so this
-- migration applies completely or not at all (PostgreSQL DDL is transactional).
BEGIN;

-- CreateEnum
CREATE TYPE "ActivityRecordKind" AS ENUM ('DAILY', 'PERIOD');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('ROUTINE_FLARING', 'NON_ROUTINE_FLARING', 'EMERGENCY_FLARING', 'VENTING', 'OTHER_RELEASE');

-- CreateEnum
CREATE TYPE "MeasurementBasis" AS ENUM ('MEASURED', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "MeasurementMethod" AS ENUM ('METERED', 'CALCULATED', 'ENGINEERING_ESTIMATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityDataSource" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "ActivityRecordStatus" AS ENUM ('DRAFT', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RateUnit" AS ENUM ('MMSCF_PER_DAY', 'SM3_PER_DAY', 'MMSM3_PER_DAY');

-- CreateEnum
CREATE TYPE "VolumeUnit" AS ENUM ('MMSCF', 'BCF', 'SM3', 'MMSM3');

-- CreateEnum
CREATE TYPE "TemperatureUnit" AS ENUM ('CELSIUS', 'FAHRENHEIT', 'KELVIN');

-- CreateEnum
CREATE TYPE "PressureUnit" AS ENUM ('KPA_ABS', 'BAR_ABS', 'PSIA');

-- AlterTable
ALTER TABLE "facilities" ADD COLUMN     "timeZone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Lagos';

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "defaultReferencePressure" DECIMAL(30,10) NOT NULL DEFAULT 101.325,
ADD COLUMN     "defaultReferencePressureUnit" "PressureUnit" NOT NULL DEFAULT 'KPA_ABS',
ADD COLUMN     "defaultReferenceTemperature" DECIMAL(30,10) NOT NULL DEFAULT 15,
ADD COLUMN     "defaultReferenceTemperatureUnit" "TemperatureUnit" NOT NULL DEFAULT 'CELSIUS';

-- CreateTable
CREATE TABLE "activity_records" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "flareSourceId" UUID NOT NULL,
    "kind" "ActivityRecordKind" NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "otherTypeDescription" VARCHAR(500),
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "timeZone" VARCHAR(64) NOT NULL,
    "averageRate" DECIMAL(30,10),
    "averageRateInput" VARCHAR(40),
    "rateUnit" "RateUnit",
    "totalVolume" DECIMAL(30,10),
    "totalVolumeInput" VARCHAR(40),
    "volumeUnit" "VolumeUnit",
    "operatingHours" DECIMAL(30,10),
    "operatingHoursInput" VARCHAR(40),
    "referenceTemperature" DECIMAL(30,10) NOT NULL,
    "referenceTemperatureInput" VARCHAR(40) NOT NULL,
    "referenceTemperatureUnit" "TemperatureUnit" NOT NULL,
    "referencePressure" DECIMAL(30,10) NOT NULL,
    "referencePressureInput" VARCHAR(40) NOT NULL,
    "referencePressureUnit" "PressureUnit" NOT NULL,
    "zSource" DECIMAL(12,6),
    "zSourceInput" VARCHAR(40),
    "zReference" DECIMAL(12,6),
    "zReferenceInput" VARCHAR(40),
    "measurementBasis" "MeasurementBasis" NOT NULL,
    "estimateExplanation" VARCHAR(2000),
    "measurementMethod" "MeasurementMethod" NOT NULL,
    "methodDescription" VARCHAR(500),
    "dataSource" "ActivityDataSource" NOT NULL DEFAULT 'MANUAL',
    "notes" VARCHAR(2000),
    "standardRateMmscfd" DECIMAL(40,20),
    "standardVolumeMmscf" DECIMAL(40,20),
    "derivedVolumeMmscf" DECIMAL(40,20),
    "correctionFactor" DECIMAL(40,20) NOT NULL,
    "conversionVersion" VARCHAR(40) NOT NULL,
    "conversionDetails" JSONB NOT NULL,
    "standardisedAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ActivityRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawnById" UUID,
    "withdrawalReason" VARCHAR(2000),
    "overlapAcknowledgedAt" TIMESTAMPTZ(3),
    "overlapAcknowledgedById" UUID,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activity_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_records_organisationId_flareSourceId_activityType__idx" ON "activity_records"("organisationId", "flareSourceId", "activityType", "periodStart");

-- CreateIndex
CREATE INDEX "activity_records_organisationId_status_idx" ON "activity_records"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "flare_sources_organisationId_id_key" ON "flare_sources"("organisationId", "id");

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_organisationId_flareSourceId_fkey" FOREIGN KEY ("organisationId", "flareSourceId") REFERENCES "flare_sources"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_overlapAcknowledgedById_fkey" FOREIGN KEY ("overlapAcknowledgedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ─── Database-level safeguards ──────────────────────────────────────────────
-- These hold even if application validation has a bug. Prisma does not model
-- CHECK constraints, so they live only here.

ALTER TABLE "activity_records"
  -- Periods: a daily record covers exactly one day; a period record spans more than one.
  ADD CONSTRAINT "activity_records_period_check" CHECK (
    ("kind" = 'DAILY' AND "periodEnd" = "periodStart")
    OR ("kind" = 'PERIOD' AND "periodEnd" > "periodStart")
  ),
  -- At least one quantity, and each value travels with its unit and original text.
  ADD CONSTRAINT "activity_records_quantity_present_check" CHECK (
    "averageRate" IS NOT NULL OR "totalVolume" IS NOT NULL
  ),
  ADD CONSTRAINT "activity_records_rate_unit_check" CHECK (
    ("averageRate" IS NULL) = ("rateUnit" IS NULL)
    AND ("averageRate" IS NULL) = ("averageRateInput" IS NULL)
  ),
  ADD CONSTRAINT "activity_records_volume_unit_check" CHECK (
    ("totalVolume" IS NULL) = ("volumeUnit" IS NULL)
    AND ("totalVolume" IS NULL) = ("totalVolumeInput" IS NULL)
  ),
  ADD CONSTRAINT "activity_records_hours_input_check" CHECK (
    ("operatingHours" IS NULL) = ("operatingHoursInput" IS NULL)
  ),
  -- Physical domains: no negative quantities; duration and Z strictly positive;
  -- absolute pressure positive.
  ADD CONSTRAINT "activity_records_non_negative_check" CHECK (
    ("averageRate" IS NULL OR "averageRate" >= 0)
    AND ("totalVolume" IS NULL OR "totalVolume" >= 0)
    AND ("operatingHours" IS NULL OR "operatingHours" > 0)
    AND ("zSource" IS NULL OR "zSource" > 0)
    AND ("zReference" IS NULL OR "zReference" > 0)
    AND "referencePressure" > 0
  ),
  ADD CONSTRAINT "activity_records_daily_hours_check" CHECK (
    "kind" <> 'DAILY' OR "operatingHours" IS NULL OR "operatingHours" <= 24
  ),
  -- Z factors are entered as a pair.
  ADD CONSTRAINT "activity_records_z_pair_check" CHECK (
    ("zSource" IS NULL) = ("zReference" IS NULL)
  ),
  -- Required explanations.
  ADD CONSTRAINT "activity_records_estimate_explanation_check" CHECK (
    "measurementBasis" <> 'ESTIMATED' OR "estimateExplanation" IS NOT NULL
  ),
  ADD CONSTRAINT "activity_records_method_description_check" CHECK (
    "measurementMethod" <> 'OTHER' OR "methodDescription" IS NOT NULL
  ),
  ADD CONSTRAINT "activity_records_other_type_description_check" CHECK (
    "activityType" <> 'OTHER_RELEASE' OR "otherTypeDescription" IS NOT NULL
  ),
  -- A withdrawn record always says when, by whom and why; a draft never does.
  ADD CONSTRAINT "activity_records_withdrawal_check" CHECK (
    ("status" = 'WITHDRAWN') = ("withdrawnAt" IS NOT NULL)
    AND ("withdrawnAt" IS NULL) = ("withdrawnById" IS NULL)
    AND ("withdrawnAt" IS NULL) = ("withdrawalReason" IS NULL)
  ),
  ADD CONSTRAINT "activity_records_overlap_ack_check" CHECK (
    ("overlapAcknowledgedAt" IS NULL) = ("overlapAcknowledgedById" IS NULL)
  );

-- Organisation default reference condition: absolute pressure must be positive.
ALTER TABLE "organisations"
  ADD CONSTRAINT "organisations_default_reference_pressure_check"
  CHECK ("defaultReferencePressure" > 0);

COMMIT;
