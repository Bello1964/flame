-- Milestone 3: emissions calculations, methodology editions, gas compositions and flare
-- efficiencies. See docs/architecture/ARCHITECTURAL_WORKFLOW.md §8.1.
-- Wrapped so it applies completely or not at all.
BEGIN;

-- CreateEnum
CREATE TYPE "FlareService" AS ENUM ('PRODUCTION', 'REFINERY');

-- CreateEnum
CREATE TYPE "MethodologyEditionStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MethodologyParameterKind" AS ENUM ('UNIT_CONVERSION', 'CONSTANT', 'MOLECULAR_WEIGHT', 'CARBON_NUMBER', 'EMISSION_FACTOR', 'DEFAULT_ASSUMPTION', 'GWP');

-- CreateEnum
CREATE TYPE "InputRecordStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EfficiencyBasis" AS ENUM ('MEASURED_TEST', 'VENDOR_SPECIFICATION', 'DESIGN_REQUIREMENT');

-- CreateEnum
CREATE TYPE "CalculationRoute" AS ENUM ('COMPOSITION_FLARING', 'IPCC_REFERENCE_FLARING', 'COMPOSITION_VENTING');

-- CreateEnum
CREATE TYPE "EfficiencySource" AS ENUM ('FLARE_RECORD', 'METHODOLOGY_DEFAULT');

-- CreateEnum
CREATE TYPE "CalculationStatus" AS ENUM ('CALCULATED', 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "DataQuality" AS ENUM ('MEASURED_BASIS', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "CalculationEventType" AS ENUM ('CALCULATED', 'SUBMITTED', 'RECALLED', 'REVIEW_STARTED', 'CLAIM_RELEASED', 'FORWARDED', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'DISCARDED');

-- AlterTable
ALTER TABLE "flare_sources" ADD COLUMN     "flareService" "FlareService";

-- CreateTable
CREATE TABLE "methodology_editions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "edition" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" VARCHAR(4000) NOT NULL,
    "content" JSONB NOT NULL,
    "status" "MethodologyEditionStatus" NOT NULL DEFAULT 'DRAFT',
    "provenance" VARCHAR(1000),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "supersededAt" TIMESTAMPTZ(3),
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawalReason" VARCHAR(2000),

    CONSTRAINT "methodology_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "methodology_parameters" (
    "id" UUID NOT NULL,
    "editionId" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "kind" "MethodologyParameterKind" NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "value" DECIMAL(40,20) NOT NULL,
    "unit" VARCHAR(100) NOT NULL,
    "gas" VARCHAR(20),
    "appliesTo" VARCHAR(1000) NOT NULL,
    "sourceOrganisation" VARCHAR(200) NOT NULL,
    "sourceDocument" VARCHAR(500) NOT NULL,
    "sourceEdition" VARCHAR(300) NOT NULL,
    "sourceLocation" VARCHAR(500) NOT NULL,
    "sourceUrl" VARCHAR(1000),
    "retrievedOn" DATE NOT NULL,
    "notes" VARCHAR(2000),

    CONSTRAINT "methodology_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gas_compositions" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "flareSourceId" UUID NOT NULL,
    "validFrom" DATE NOT NULL,
    "sampleDate" DATE NOT NULL,
    "sampleReference" VARCHAR(300) NOT NULL,
    "analysisMethod" VARCHAR(300),
    "methane" DECIMAL(10,6) NOT NULL,
    "ethane" DECIMAL(10,6) NOT NULL,
    "propane" DECIMAL(10,6) NOT NULL,
    "isoButane" DECIMAL(10,6) NOT NULL,
    "normalButane" DECIMAL(10,6) NOT NULL,
    "isoPentane" DECIMAL(10,6) NOT NULL,
    "normalPentane" DECIMAL(10,6) NOT NULL,
    "hexanesPlus" DECIMAL(10,6) NOT NULL,
    "hexanesPlusCarbonNumber" DECIMAL(8,4),
    "carbonDioxide" DECIMAL(10,6) NOT NULL,
    "nitrogen" DECIMAL(10,6) NOT NULL,
    "hydrogenSulphide" DECIMAL(10,6) NOT NULL,
    "otherInerts" DECIMAL(10,6) NOT NULL,
    "entered" JSONB NOT NULL,
    "notes" VARCHAR(2000),
    "status" "InputRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawnById" UUID,
    "withdrawalReason" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gas_compositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flare_efficiencies" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "flareSourceId" UUID NOT NULL,
    "validFrom" DATE NOT NULL,
    "basis" "EfficiencyBasis" NOT NULL,
    "combustionEfficiencyPercent" DECIMAL(9,6) NOT NULL,
    "uncombustedMethanePercent" DECIMAL(9,6),
    "sourceReference" VARCHAR(500) NOT NULL,
    "testDate" DATE,
    "entered" JSONB NOT NULL,
    "notes" VARCHAR(2000),
    "status" "InputRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawnById" UUID,
    "withdrawalReason" VARCHAR(2000),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flare_efficiencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculations" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "activityRecordId" UUID NOT NULL,
    "flareSourceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "route" "CalculationRoute" NOT NULL,
    "editionId" UUID NOT NULL,
    "efficiencySource" "EfficiencySource",
    "flareEfficiencyId" UUID,
    "gasCompositionId" UUID,
    "fallbackReason" VARCHAR(2000),
    "notes" VARCHAR(2000),
    "inputs" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "engineVersion" VARCHAR(40) NOT NULL,
    "volumeM3" DECIMAL(40,20) NOT NULL,
    "co2Tonnes" DECIMAL(40,20) NOT NULL,
    "ch4Tonnes" DECIMAL(40,20) NOT NULL,
    "n2oTonnes" DECIMAL(40,20),
    "co2eTonnes" DECIMAL(40,20) NOT NULL,
    "dataQuality" "DataQuality" NOT NULL,
    "qualityReasons" JSONB NOT NULL,
    "status" "CalculationStatus" NOT NULL DEFAULT 'CALCULATED',
    "submittedAt" TIMESTAMPTZ(3),
    "claimedById" UUID,
    "claimedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "approvedById" UUID,
    "supersededAt" TIMESTAMPTZ(3),
    "discardedAt" TIMESTAMPTZ(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_events" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "calculationId" UUID NOT NULL,
    "type" "CalculationEventType" NOT NULL,
    "fromStatus" "CalculationStatus",
    "toStatus" "CalculationStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" VARCHAR(2000),
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "methodology_editions_code_edition_key" ON "methodology_editions"("code", "edition");

-- CreateIndex
CREATE UNIQUE INDEX "methodology_parameters_editionId_key_key" ON "methodology_parameters"("editionId", "key");

-- CreateIndex
CREATE INDEX "gas_compositions_organisationId_flareSourceId_validFrom_idx" ON "gas_compositions"("organisationId", "flareSourceId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "gas_compositions_organisationId_id_key" ON "gas_compositions"("organisationId", "id");

-- CreateIndex
CREATE INDEX "flare_efficiencies_organisationId_flareSourceId_validFrom_idx" ON "flare_efficiencies"("organisationId", "flareSourceId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "flare_efficiencies_organisationId_id_key" ON "flare_efficiencies"("organisationId", "id");

-- CreateIndex
CREATE INDEX "calculations_organisationId_status_idx" ON "calculations"("organisationId", "status");

-- CreateIndex
CREATE INDEX "calculations_organisationId_activityRecordId_idx" ON "calculations"("organisationId", "activityRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "calculations_organisationId_id_key" ON "calculations"("organisationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "calculations_activityRecordId_version_key" ON "calculations"("activityRecordId", "version");

-- CreateIndex
CREATE INDEX "calculation_events_organisationId_calculationId_createdAt_idx" ON "calculation_events"("organisationId", "calculationId", "createdAt");

-- AddForeignKey
ALTER TABLE "methodology_editions" ADD CONSTRAINT "methodology_editions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "methodology_editions" ADD CONSTRAINT "methodology_editions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "methodology_parameters" ADD CONSTRAINT "methodology_parameters_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "methodology_editions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gas_compositions" ADD CONSTRAINT "gas_compositions_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gas_compositions" ADD CONSTRAINT "gas_compositions_organisationId_flareSourceId_fkey" FOREIGN KEY ("organisationId", "flareSourceId") REFERENCES "flare_sources"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gas_compositions" ADD CONSTRAINT "gas_compositions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gas_compositions" ADD CONSTRAINT "gas_compositions_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flare_efficiencies" ADD CONSTRAINT "flare_efficiencies_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flare_efficiencies" ADD CONSTRAINT "flare_efficiencies_organisationId_flareSourceId_fkey" FOREIGN KEY ("organisationId", "flareSourceId") REFERENCES "flare_sources"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flare_efficiencies" ADD CONSTRAINT "flare_efficiencies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flare_efficiencies" ADD CONSTRAINT "flare_efficiencies_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_organisationId_activityRecordId_fkey" FOREIGN KEY ("organisationId", "activityRecordId") REFERENCES "activity_records"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_organisationId_flareSourceId_fkey" FOREIGN KEY ("organisationId", "flareSourceId") REFERENCES "flare_sources"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "methodology_editions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_organisationId_flareEfficiencyId_fkey" FOREIGN KEY ("organisationId", "flareEfficiencyId") REFERENCES "flare_efficiencies"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_organisationId_gasCompositionId_fkey" FOREIGN KEY ("organisationId", "gasCompositionId") REFERENCES "gas_compositions"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculation_events" ADD CONSTRAINT "calculation_events_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculation_events" ADD CONSTRAINT "calculation_events_organisationId_calculationId_fkey" FOREIGN KEY ("organisationId", "calculationId") REFERENCES "calculations"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "calculation_events" ADD CONSTRAINT "calculation_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── Database-level safeguards ──────────────────────────────────────────────

-- Methodology: only one draft per methodology at a time; frozen once approved.
CREATE UNIQUE INDEX "methodology_editions_one_draft" ON "methodology_editions" ("code") WHERE "status" = 'DRAFT';
ALTER TABLE "methodology_editions"
  ADD CONSTRAINT "methodology_editions_edition_check" CHECK ("edition" >= 1),
  ADD CONSTRAINT "methodology_editions_approval_check" CHECK (
    ("status" IN ('APPROVED', 'SUPERSEDED')) = ("approvedAt" IS NOT NULL)
    AND ("approvedAt" IS NULL) = ("approvedById" IS NULL)
  ),
  ADD CONSTRAINT "methodology_editions_superseded_check" CHECK (("status" = 'SUPERSEDED') = ("supersededAt" IS NOT NULL)),
  ADD CONSTRAINT "methodology_editions_withdrawal_check" CHECK (
    ("status" = 'WITHDRAWN') = ("withdrawnAt" IS NOT NULL)
    AND ("withdrawnAt" IS NULL) = ("withdrawalReason" IS NULL)
  ),
  -- Someone (a user or a recorded provenance) always stands behind an edition.
  ADD CONSTRAINT "methodology_editions_origin_check" CHECK ("createdById" IS NOT NULL OR "provenance" IS NOT NULL),
  -- Two people: an edition is never approved by the person who created it.
  ADD CONSTRAINT "methodology_editions_two_person_check" CHECK ("approvedById" IS NULL OR "approvedById" IS DISTINCT FROM "createdById");

CREATE FUNCTION "methodology_editions_guard"() RETURNS trigger AS $$
DECLARE transition text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'methodology_editions are never deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status"::text <> 'DRAFT' THEN RAISE EXCEPTION 'methodology editions start as DRAFT'; END IF;
    RETURN NEW;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."code" IS DISTINCT FROM OLD."code"
     OR NEW."edition" IS DISTINCT FROM OLD."edition" OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."provenance" IS DISTINCT FROM OLD."provenance" THEN
    RAISE EXCEPTION 'methodology edition %: identity cannot change', OLD."id";
  END IF;
  IF OLD."status"::text <> 'DRAFT'
     AND (NEW."title" IS DISTINCT FROM OLD."title" OR NEW."summary" IS DISTINCT FROM OLD."summary"
          OR NEW."content" IS DISTINCT FROM OLD."content"
          OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt" OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById") THEN
    RAISE EXCEPTION 'methodology edition % is %, so it cannot change', OLD."id", OLD."status";
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    transition := OLD."status"::text || '>' || NEW."status"::text;
    IF transition NOT IN ('DRAFT>APPROVED', 'DRAFT>WITHDRAWN', 'APPROVED>SUPERSEDED') THEN
      RAISE EXCEPTION 'methodology edition % cannot move from % to %', OLD."id", OLD."status", NEW."status";
    END IF;
  ELSIF OLD."status"::text IN ('SUPERSEDED', 'WITHDRAWN') AND to_jsonb(NEW) - 'updatedAt' IS DISTINCT FROM to_jsonb(OLD) - 'updatedAt' THEN
    RAISE EXCEPTION 'methodology edition % is %, so it cannot change', OLD."id", OLD."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "methodology_editions_guard" BEFORE INSERT OR UPDATE OR DELETE ON "methodology_editions"
  FOR EACH ROW EXECUTE FUNCTION "methodology_editions_guard"();

-- Parameters change only while their edition is a draft.
CREATE FUNCTION "methodology_parameters_guard"() RETURNS trigger AS $$
DECLARE edition_status text;
BEGIN
  SELECT "status"::text INTO edition_status FROM "methodology_editions"
   WHERE "id" = COALESCE(NEW."editionId", OLD."editionId");
  IF TG_OP = 'UPDATE' AND NEW."editionId" IS DISTINCT FROM OLD."editionId" THEN
    RAISE EXCEPTION 'a methodology parameter cannot move to another edition';
  END IF;
  IF edition_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'methodology parameters of a % edition cannot change', edition_status;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "methodology_parameters_guard" BEFORE INSERT OR UPDATE OR DELETE ON "methodology_parameters"
  FOR EACH ROW EXECUTE FUNCTION "methodology_parameters_guard"();

-- Gas compositions and flare efficiencies: never edited or deleted; only withdrawn.
ALTER TABLE "gas_compositions"
  ADD CONSTRAINT "gas_compositions_components_check" CHECK (
    "methane" >= 0 AND "ethane" >= 0 AND "propane" >= 0 AND "isoButane" >= 0 AND "normalButane" >= 0
    AND "isoPentane" >= 0 AND "normalPentane" >= 0 AND "hexanesPlus" >= 0 AND "carbonDioxide" >= 0
    AND "nitrogen" >= 0 AND "hydrogenSulphide" >= 0 AND "otherInerts" >= 0
  ),
  ADD CONSTRAINT "gas_compositions_total_check" CHECK (
    ("methane" + "ethane" + "propane" + "isoButane" + "normalButane" + "isoPentane" + "normalPentane"
     + "hexanesPlus" + "carbonDioxide" + "nitrogen" + "hydrogenSulphide" + "otherInerts") BETWEEN 99.5 AND 100.5
  ),
  ADD CONSTRAINT "gas_compositions_c6_check" CHECK (
    "hexanesPlus" = 0 OR ("hexanesPlusCarbonNumber" IS NOT NULL AND "hexanesPlusCarbonNumber" >= 6)
  ),
  ADD CONSTRAINT "gas_compositions_dates_check" CHECK ("validFrom" >= DATE '2000-01-01' AND "sampleDate" >= DATE '2000-01-01'),
  ADD CONSTRAINT "gas_compositions_withdrawal_check" CHECK (
    ("status" = 'WITHDRAWN') = ("withdrawnAt" IS NOT NULL)
    AND ("withdrawnAt" IS NULL) = ("withdrawnById" IS NULL)
    AND ("withdrawnAt" IS NULL) = ("withdrawalReason" IS NULL)
  );
ALTER TABLE "flare_efficiencies"
  ADD CONSTRAINT "flare_efficiencies_values_check" CHECK (
    "combustionEfficiencyPercent" > 0 AND "combustionEfficiencyPercent" <= 100
    AND ("uncombustedMethanePercent" IS NULL OR ("uncombustedMethanePercent" >= 0 AND "uncombustedMethanePercent" <= 100))
  ),
  ADD CONSTRAINT "flare_efficiencies_methane_check" CHECK (
    "basis" = 'DESIGN_REQUIREMENT' OR "uncombustedMethanePercent" IS NOT NULL
  ),
  ADD CONSTRAINT "flare_efficiencies_dates_check" CHECK ("validFrom" >= DATE '2000-01-01'),
  ADD CONSTRAINT "flare_efficiencies_withdrawal_check" CHECK (
    ("status" = 'WITHDRAWN') = ("withdrawnAt" IS NOT NULL)
    AND ("withdrawnAt" IS NULL) = ("withdrawnById" IS NULL)
    AND ("withdrawnAt" IS NULL) = ("withdrawalReason" IS NULL)
  );

CREATE FUNCTION "calculation_inputs_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status"::text <> 'ACTIVE' THEN RAISE EXCEPTION '% rows start ACTIVE', TG_TABLE_NAME; END IF;
    RETURN NEW;
  END IF;
  IF OLD."status"::text <> 'ACTIVE' OR NEW."status"::text <> 'WITHDRAWN'
     OR (to_jsonb(NEW) - ARRAY['status', 'withdrawnAt', 'withdrawnById', 'withdrawalReason'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'withdrawnAt', 'withdrawnById', 'withdrawalReason']) THEN
    RAISE EXCEPTION '% rows are never edited; they can only be withdrawn', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "gas_compositions_guard" BEFORE INSERT OR UPDATE OR DELETE ON "gas_compositions"
  FOR EACH ROW EXECUTE FUNCTION "calculation_inputs_guard"();
CREATE TRIGGER "flare_efficiencies_guard" BEFORE INSERT OR UPDATE OR DELETE ON "flare_efficiencies"
  FOR EACH ROW EXECUTE FUNCTION "calculation_inputs_guard"();

-- Calculations: results never change; only the workflow moves.
CREATE UNIQUE INDEX "calculations_one_open_per_record" ON "calculations" ("activityRecordId")
  WHERE "status" IN ('CALCULATED', 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_APPROVAL');
ALTER TABLE "calculations"
  ADD CONSTRAINT "calculations_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "calculations_results_check" CHECK (
    "volumeM3" >= 0 AND "co2Tonnes" >= 0 AND "ch4Tonnes" >= 0 AND ("n2oTonnes" IS NULL OR "n2oTonnes" >= 0) AND "co2eTonnes" >= 0
  ),
  ADD CONSTRAINT "calculations_route_check" CHECK (
    ("route" = 'IPCC_REFERENCE_FLARING') = ("fallbackReason" IS NOT NULL)
    AND ("route" = 'COMPOSITION_FLARING') = ("efficiencySource" IS NOT NULL)
    AND ("route" = 'IPCC_REFERENCE_FLARING') = ("gasCompositionId" IS NULL)
    AND ("flareEfficiencyId" IS NOT NULL) = ("efficiencySource" IS NOT DISTINCT FROM 'FLARE_RECORD')
    AND ("route" = 'COMPOSITION_VENTING') = ("n2oTonnes" IS NULL)
  ),
  ADD CONSTRAINT "calculations_claim_check" CHECK (
    ("status" = 'UNDER_REVIEW') = ("claimedById" IS NOT NULL) AND ("claimedById" IS NULL) = ("claimedAt" IS NULL)
  ),
  ADD CONSTRAINT "calculations_approval_check" CHECK (
    ("status" IN ('APPROVED', 'SUPERSEDED')) = ("approvedAt" IS NOT NULL) AND ("approvedAt" IS NULL) = ("approvedById" IS NULL)
  ),
  ADD CONSTRAINT "calculations_superseded_check" CHECK (("status" = 'SUPERSEDED') = ("supersededAt" IS NOT NULL)),
  ADD CONSTRAINT "calculations_discarded_check" CHECK (("status" = 'DISCARDED') = ("discardedAt" IS NOT NULL));

CREATE FUNCTION "calculations_guard"() RETURNS trigger AS $$
DECLARE
  workflow_columns text[] := ARRAY['status', 'updatedById', 'updatedAt', 'submittedAt', 'claimedById', 'claimedAt',
                                   'approvedAt', 'approvedById', 'supersededAt', 'discardedAt'];
  transition text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'calculations are never deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status"::text <> 'CALCULATED' THEN RAISE EXCEPTION 'calculations start as CALCULATED'; END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - workflow_columns) IS DISTINCT FROM (to_jsonb(OLD) - workflow_columns) THEN
    RAISE EXCEPTION 'calculation %: inputs and results never change; recalculate as a new version', OLD."id";
  END IF;
  IF OLD."status"::text = 'APPROVED'
     AND (NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt" OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById") THEN
    RAISE EXCEPTION 'calculation %: who approved it, and when, cannot change', OLD."id";
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    transition := OLD."status"::text || '>' || NEW."status"::text;
    IF transition NOT IN (
      'CALCULATED>SUBMITTED', 'CALCULATED>DISCARDED',
      'SUBMITTED>CALCULATED', 'SUBMITTED>UNDER_REVIEW',
      'UNDER_REVIEW>SUBMITTED', 'UNDER_REVIEW>AWAITING_APPROVAL', 'UNDER_REVIEW>REJECTED',
      'AWAITING_APPROVAL>APPROVED', 'AWAITING_APPROVAL>REJECTED',
      'APPROVED>SUPERSEDED'
    ) THEN
      RAISE EXCEPTION 'calculation % cannot move from % to %', OLD."id", OLD."status", NEW."status";
    END IF;
  ELSE
    IF NEW."claimedById" IS DISTINCT FROM OLD."claimedById" OR NEW."claimedAt" IS DISTINCT FROM OLD."claimedAt"
       OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt" THEN
      RAISE EXCEPTION 'calculation %: claim and submission change only with a status change', OLD."id";
    END IF;
    IF OLD."status"::text IN ('APPROVED', 'REJECTED', 'SUPERSEDED', 'DISCARDED') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'calculation % is %, so it cannot change', OLD."id", OLD."status";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "calculations_guard" BEFORE INSERT OR UPDATE OR DELETE ON "calculations"
  FOR EACH ROW EXECUTE FUNCTION "calculations_guard"();

-- Calculation history: append-only, like the audit log and the activity record history.
CREATE FUNCTION "calculation_events_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'calculation_events is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "calculation_events_append_only" BEFORE UPDATE OR DELETE ON "calculation_events"
  FOR EACH ROW EXECUTE FUNCTION "calculation_events_append_only"();
CREATE TRIGGER "calculation_events_no_truncate" BEFORE TRUNCATE ON "calculation_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "calculation_events_append_only"();

-- App role: nothing in these tables is ever deleted; the history is append-only.
REVOKE DELETE ON "methodology_editions", "methodology_parameters", "gas_compositions", "flare_efficiencies", "calculations" FROM flame_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "calculation_events" FROM flame_app;

-- ─── Methodology edition 1 (DRAFT) ──────────────────────────────────────────
-- Values confirmed by the product owner on 2026-11-16 and checked against the source
-- documents. A Platform Administrator approves the edition in the app before any
-- calculation can use it.
INSERT INTO "methodology_editions" ("id", "code", "edition", "title", "summary", "content", "status", "provenance", "updatedAt")
VALUES ('019a8f00-0000-7000-8000-000000000001', 'flame-flaring-venting', 1,
  'Flame flaring and venting emissions methodology',
  'How Flame calculates CO₂, CH₄, N₂O and tCO₂e for gas flaring and venting: IPCC 2006 Vol. 2 Ch. 4 equations and constants, API Compendium (2009) §4.6 composition methods and defaults, IPCC AR5 100-year GWPs, within NUPRC reporting requirements.',
  '{"overview": ["This edition explains how Flame turns an approved gas activity record into emissions of CO₂, CH₄ and N₂O, and then into tonnes of CO₂ equivalent (tCO₂e). Every number used is listed below with its source, and every choice is listed with the reason for it.", "A calculation always records the edition it used. When the methodology changes, a new edition is published; earlier editions stay readable here, so any past result can be traced to the exact rules and numbers behind it.", "tCO₂e is an emissions figure. It is not a carbon credit and does not create or imply one."], "routes": [{"key": "COMPOSITION_FLARING", "title": "Flaring: measured gas composition", "appliesTo": "Routine, non-routine and emergency flaring", "requires": ["An approved activity record with a volume (entered, or derived from rate × operating hours)", "A gas analysis valid for the whole period of the record", "A tested or vendor flare efficiency valid for the period, or the methodology default chosen explicitly (result then Estimated)"], "steps": [{"key": "volume", "title": "Gas volume in m³", "formula": "V = V_MMscf × k_m³", "explanation": "The activity record''s standardised volume (MMscf at 15 °C and 101.325 kPa, entered or derived from rate × operating hours) in cubic metres at the same condition.", "parameters": ["conv.m3_per_mmscf"]}, {"key": "moles", "title": "Moles of gas", "formula": "n = V × ρ_mol", "explanation": "Kilomoles of gas in the volume, using the IPCC molar-volume constant for 15 °C and 101.325 kPa.", "parameters": ["ipcc.molar_volume"]}, {"key": "carbon", "title": "Hydrocarbon carbon per mole of gas", "formula": "C = Σ (y_i × N_C,i),  y_i = mole % ÷ 100", "explanation": "Moles of carbon in the hydrocarbons per mole of gas: methane 1, ethane 2, propane 3, butanes 4, pentanes 5, and C₆+ with the carbon number stated on the analysis.", "parameters": ["nc.methane", "nc.ethane", "nc.propane", "nc.butane", "nc.pentane"]}, {"key": "co2", "title": "Carbon dioxide", "formula": "CO₂ = n × (C × η ÷ 100 + y_CO₂) × MW_CO₂ ÷ k_kg/t", "explanation": "API Equation 4-15: hydrocarbon carbon converted at efficiency η, plus the CO₂ already in the gas, which passes through in full.", "parameters": ["mw.co2", "conv.kg_per_tonne", "api.co2_conversion_default"]}, {"key": "ch4", "title": "Methane (uncombusted)", "formula": "CH₄ = n × y_CH₄ × f ÷ 100 × MW_CH₄ ÷ k_kg/t", "explanation": "API Equation 4-16: the fraction f of the methane that leaves the flare unburned.", "parameters": ["mw.ch4", "conv.kg_per_tonne", "api.ch4_uncombusted_production", "api.ch4_uncombusted_refinery"]}, {"key": "n2o", "title": "Nitrous oxide", "formula": "N₂O = V ÷ 10⁶ × EF_N₂O × k_t/Gg", "explanation": "The IPCC factor per 10⁶ m³ of gas flared, converted from Gg to tonnes.", "parameters": ["ipcc.direct.n2o", "conv.tonnes_per_gg"]}, {"key": "co2e", "title": "Carbon dioxide equivalent", "formula": "tCO₂e = CO₂ × GWP_CO₂ + CH₄ × GWP_CH₄ + N₂O × GWP_N₂O", "explanation": "Each gas in tonnes times its 100-year GWP (IPCC AR5). The individual gases are always kept alongside the total.", "parameters": ["gwp.co2", "gwp.ch4", "gwp.n2o"]}]}, {"key": "IPCC_REFERENCE_FLARING", "title": "Flaring: IPCC reference case (fallback)", "appliesTo": "Routine, non-routine and emergency flaring, when no gas analysis is available and a reason is given", "requires": ["An approved activity record with a volume", "A reason for not using measured composition"], "steps": [{"key": "volume", "title": "Gas volume in m³", "formula": "V = V_MMscf × k_m³", "explanation": "The activity record''s standardised volume (MMscf at 15 °C and 101.325 kPa, entered or derived from rate × operating hours) in cubic metres at the same condition.", "parameters": ["conv.m3_per_mmscf"]}, {"key": "co2", "title": "Carbon dioxide", "formula": "CO₂ = V ÷ 10⁶ × EF_CO₂ × k_t/Gg", "explanation": "IPCC reference-case factor per 10⁶ m³ flared.", "parameters": ["ipcc.direct.co2", "conv.tonnes_per_gg"]}, {"key": "ch4", "title": "Methane", "formula": "CH₄ = V ÷ 10⁶ × EF_CH₄ × k_t/Gg", "explanation": "IPCC reference-case factor per 10⁶ m³ flared.", "parameters": ["ipcc.direct.ch4", "conv.tonnes_per_gg"]}, {"key": "n2o", "title": "Nitrous oxide", "formula": "N₂O = V ÷ 10⁶ × EF_N₂O × k_t/Gg", "explanation": "The IPCC factor per 10⁶ m³ of gas flared, converted from Gg to tonnes.", "parameters": ["ipcc.direct.n2o", "conv.tonnes_per_gg"]}, {"key": "co2e", "title": "Carbon dioxide equivalent", "formula": "tCO₂e = CO₂ × GWP_CO₂ + CH₄ × GWP_CH₄ + N₂O × GWP_N₂O", "explanation": "Each gas in tonnes times its 100-year GWP (IPCC AR5). The individual gases are always kept alongside the total.", "parameters": ["gwp.co2", "gwp.ch4", "gwp.n2o"]}]}, {"key": "COMPOSITION_VENTING", "title": "Venting: measured gas composition", "appliesTo": "Venting (including gas released through an unlit flare)", "requires": ["An approved venting activity record with a volume", "A gas analysis valid for the whole period of the record"], "steps": [{"key": "volume", "title": "Gas volume in m³", "formula": "V = V_MMscf × k_m³", "explanation": "The activity record''s standardised volume (MMscf at 15 °C and 101.325 kPa, entered or derived from rate × operating hours) in cubic metres at the same condition.", "parameters": ["conv.m3_per_mmscf"]}, {"key": "moles", "title": "Moles of gas", "formula": "n = V × ρ_mol", "explanation": "Kilomoles of gas in the volume, using the IPCC molar-volume constant for 15 °C and 101.325 kPa.", "parameters": ["ipcc.molar_volume"]}, {"key": "ch4", "title": "Methane", "formula": "CH₄ = n × y_CH₄ × MW_CH₄ ÷ k_kg/t", "explanation": "All methane in vented gas is emitted; nothing is burned.", "parameters": ["mw.ch4", "conv.kg_per_tonne"]}, {"key": "co2", "title": "Carbon dioxide", "formula": "CO₂ = n × y_CO₂ × MW_CO₂ ÷ k_kg/t", "explanation": "The CO₂ present in the vented gas is emitted as it is.", "parameters": ["mw.co2", "conv.kg_per_tonne"]}, {"key": "co2e", "title": "Carbon dioxide equivalent", "formula": "tCO₂e = CO₂ × GWP_CO₂ + CH₄ × GWP_CH₄", "explanation": "Each gas in tonnes times its 100-year GWP (IPCC AR5). The individual gases are always kept alongside the total.", "parameters": ["gwp.co2", "gwp.ch4"]}]}], "decisions": [{"key": "reference-conditions", "title": "Volumes at 15 °C and 101.325 kPa", "decision": "All calculations use gas volumes standardised to 15 °C and 101.325 kPa absolute. The original reading, its unit and its reference condition stay on the activity record.", "reason": "This is the reference condition of the IPCC equations and of ISO 13443, so IPCC constants and factors apply without a further conversion. Mixing 15 °C with the 60 °F basis used elsewhere would silently shift results.", "references": [{"label": "IPCC 2006 Guidelines, Vol. 2, Ch. 4", "location": "p. 4.44–4.45, Equations 4.2.3–4.2.8 (\"referenced at 15°C and 101.325 kPa\")", "url": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf"}, {"label": "ISO 13443:1996, Natural gas — Standard reference conditions", "location": "15 °C and 101.325 kPa"}]}, {"key": "molar-volume", "title": "IPCC molar-volume constant (42.3 × 10⁻³ kmol/m³)", "decision": "Moles of gas are calculated with the IPCC constant 42.3 × 10⁻³ kmol/m³, not the exact ideal-gas value.", "reason": "It is the constant IPCC states for its equations and from which its published factors are derived, so Flame''s arithmetic matches IPCC''s. The exact ideal-gas value (0.0422932…) differs by about 0.016%. API''s 23.685 m³/kmol is for API''s own reference conditions and is not used.", "references": [{"label": "IPCC 2006 Guidelines, Vol. 2, Ch. 4", "location": "p. 4.45", "url": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf"}, {"label": "API Compendium (2009)", "location": "p. 4-39, Equation 4-15 definitions", "url": "https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf"}]}, {"key": "method-selection", "title": "Measured composition first; IPCC reference case only as a stated fallback", "decision": "Flaring is calculated from the measured gas composition whenever an analysis covers the record. The IPCC reference-case factors may be used instead only when a reason is recorded, and the result is labelled Estimated. The production-based IPCC Tier 2 route (gas-to-oil ratio × oil production) is not offered.", "reason": "IPCC and API both prefer actual flared volumes and measured composition over generic assumptions; NUPRC requires at least IPCC Tier 2 from Q3 2026 and measurement-based methods by January 2027. The reference-case factors assume a 91.9% methane gas that may not match a given flare. Flame does not yet capture production data for the production-based route.", "references": [{"label": "API Compendium (2009)", "location": "Section 4.6, Figure 4-2", "url": "https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf"}, {"label": "IPCC 2006 Guidelines, Vol. 2, Ch. 4", "location": "Table 4.2.5, footnote e, p. 4.63 (\"Where actual flared volumes are known, these should be used\")", "url": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf"}, {"label": "NUPRC directive on measurement-based methane/GHG reporting (11 April 2026)", "location": "Announcement", "url": "https://nuprcdemo.nuprc.gov.ng/media/news/b3f0614395dd79cd01ae509f"}]}, {"key": "co2-composition", "title": "CO₂ from carbon content, with incoming CO₂ counted in full", "decision": "CO₂ = moles of gas × (hydrocarbon carbon × conversion efficiency + CO₂ fraction) × 44.011. The conversion efficiency applies only to hydrocarbon carbon.", "reason": "API Equation 4-15. CO₂ already present in the gas is emitted directly; neither destruction efficiency nor carbon conversion applies to it. Soot is taken as zero, the IPCC conservative approximation when no data exist.", "references": [{"label": "API Compendium (2009)", "location": "Section 4.6, Equation 4-15, p. 4-39", "url": "https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf"}, {"label": "IPCC 2006 Guidelines, Vol. 2, Ch. 4", "location": "p. 4.45, definition of X_soot", "url": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf"}]}, {"key": "ch4-composition", "title": "Methane is the uncombusted fraction", "decision": "CH₄ = moles of gas × methane fraction × uncombusted fraction × 16.043.", "reason": "API Equation 4-16, consistent with IPCC Equation 4.2.4 (1 − FE).", "references": [{"label": "API Compendium (2009)", "location": "Section 4.6, Equation 4-16, p. 4-40", "url": "https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf"}, {"label": "IPCC 2006 Guidelines, Vol. 2, Ch. 4", "location": "Equation 4.2.4, p. 4.44", "url": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf"}]}, {"key": "n2o", "title": "N₂O from the IPCC factor per volume flared", "decision": "On both flaring routes, N₂O = volume flared × 0.000023 Gg per 10⁶ m³. Venting produces no N₂O.", "reason": "Neither reference gives a composition-based N₂O method; API''s Equation 4-17 uses IPCC factors. The value was checked in IPCC Tables 4.2.4 and 4.2.5 (footnote e) and in both API footnotes citing them, which all give 0.000023; it was confirmed by the product owner on 2026-11-16. NUPRC requires CO₂, CH₄ and N₂O to be reported separately.", "references": [{"label": "IPCC 2006 Guidelines, Vol. 2, Ch. 4", "location": "Table 4.2.5, footnote e, p. 4.63; Table 4.2.4, footnote e, p. 4.54", "url": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf"}, {"label": "API Compendium (2009)", "location": "Section 4.6, Equation 4-17, p. 4-40; Tables 4-11 and 4-12 footnotes", "url": "https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf"}, {"label": "NUPRC Guide 0024-2022", "location": "Section 4.1", "url": "https://www.nuprc.gov.ng/upload/nuprc_laws/METHANE_AND_GREENHOUSE_GASES_EMISSIONS_1781449647912.pdf"}]}, {"key": "efficiency", "title": "Flare efficiency: test or vendor values first; defaults only when chosen, and labelled", "decision": "A tested or vendor-specified efficiency recorded for the flare is used when one is valid for the period. Otherwise the person running the calculation may choose the methodology default: 98% carbon conversion, with 2% uncombusted methane at production flares or 0.5% at refinery flares. A result using a default is labelled Estimated. NUPRC''s 98% design DRE is recorded as a requirement and never used as achieved performance.", "reason": "API ranks flare-specific test or vendor data above generic assumptions and notes that some production flares tested below 98%. The refinery figure applies only to well-designed refinery flares, so it is never used for production flares. A design requirement says what a flare should achieve, not what it did.", "references": [{"label": "API Compendium (2009)", "location": "Section 4.6, Figure 4-2 and pp. 4-39–4-40", "url": "https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf"}, {"label": "IPCC 2006 Guidelines, Vol. 2, Ch. 4", "location": "p. 4.45, definition of FE (0.98 production, 0.995 refineries)", "url": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf"}, {"label": "NUPRC Guide 0024-2022", "location": "Section 3.3.2", "url": "https://www.nuprc.gov.ng/upload/nuprc_laws/METHANE_AND_GREENHOUSE_GASES_EMISSIONS_1781449647912.pdf"}]}, {"key": "venting", "title": "Venting is calculated without combustion", "decision": "Vented gas emits all of its methane and CO₂. Gas released through an unlit flare is recorded as venting, not flaring. \"Other gas release\" is not calculated until a methodology for it is approved.", "reason": "IPCC Equation 4.2.3 treats vented gas as released unburned; API treats a flare without a flame as a vented source. Applying flaring efficiency to venting would understate methane.", "references": [{"label": "IPCC 2006 Guidelines, Vol. 2, Ch. 4", "location": "Equation 4.2.3, p. 4.44", "url": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf"}, {"label": "NUPRC Guide 0024-2022", "location": "Section 3.3.2", "url": "https://www.nuprc.gov.ng/upload/nuprc_laws/METHANE_AND_GREENHOUSE_GASES_EMISSIONS_1781449647912.pdf"}, {"label": "NUPRC Gas Flaring, Venting and Methane Emissions Regulations, 2023", "location": "Daily flare and vent logs", "url": "https://www.nuprc.gov.ng/upload/nuprc_laws/Gas_Flaring_Venting_and_Methane_Reg_2023_cd4e70a88c3295914a6466e9.pdf"}]}, {"key": "reference-case", "title": "IPCC reference-case factors are a labelled fallback", "decision": "The factors 2.0 (CO₂), 0.012 (CH₄) and 0.000023 (N₂O) Gg per 10⁶ m³ flared are used only on the reference-case route, with a recorded reason, and the result is labelled Estimated.", "reason": "They assume 98% efficiency and a processing-plant gas of 91.9% CH₄, 0.58% CO₂, 0.68% N₂ and 6.84% NMHC. They are not universal; a different gas gives different emissions.", "references": [{"label": "IPCC 2006 Guidelines, Vol. 2, Ch. 4", "location": "Table 4.2.5, footnote e, p. 4.63", "url": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf"}]}, {"key": "gwp", "title": "GWP: IPCC AR5, 100-year (CH₄ 28, N₂O 265)", "decision": "tCO₂e uses the AR5 100-year values CO₂ 1, CH₄ 28 and N₂O 265. The AR5 \"fossil methane\" value (30) is not used.", "reason": "AR5 100-year values are the ones IPCC-based national inventories report with under the Paris Agreement transparency rules, matching NUPRC''s requirement to report in line with the IPCC standard. Corporate-standard (GHG Protocol) reports would use 30 for oil-and-gas methane, about 7% higher on CH₄. The values were read from the GHG Protocol''s tabulation of AR5 because the IPCC site refused automated retrieval.", "references": [{"label": "GHG Protocol, IPCC Global Warming Potential Values v2.0 (7 Aug 2024), tabulating IPCC AR5 WG1 Ch. 8", "location": "GWP table, \"Major Greenhouse Gases\"; methane guidance p. 1", "url": "https://ghgprotocol.org/sites/default/files/2024-08/Global-Warming-Potential-Values%20%28August%202024%29.pdf"}, {"label": "NUPRC Guide 0024-2022", "location": "Section 4.1", "url": "https://www.nuprc.gov.ng/upload/nuprc_laws/METHANE_AND_GREENHOUSE_GASES_EMISSIONS_1781449647912.pdf"}]}, {"key": "approved-data-only", "title": "Only approved activity data; results reviewed and approved", "decision": "A calculation can run only on an approved activity record and an approved edition of this methodology. Each result is then submitted, reviewed and approved by different people before it can be used in official reporting.", "reason": "Only approved activity records may contribute to officially approved emissions, and nobody may approve their own work.", "references": [{"label": "Flame architecture, ARCHITECTURAL_WORKFLOW.md", "location": "§7.1 and §8.1"}]}, {"key": "precision", "title": "Exact decimal arithmetic; rounding only for display", "decision": "Calculations use 40-significant-digit decimal arithmetic and store results to 20 decimal places. Nothing is rounded until it is displayed, and the full value is always available.", "reason": "Binary floating point can''t represent values like 0.000023 exactly, and early rounding would make results impossible to reproduce.", "references": [{"label": "Flame architecture, ARCHITECTURAL_WORKFLOW.md", "location": "§4.1 and §8"}]}, {"key": "data-quality", "title": "Every result says how it was obtained", "decision": "A result is \"Measured basis\" only when the activity was measured, the gas composition was measured and the flare efficiency (for flaring) came from a test or vendor specification. Otherwise it is \"Estimated\", with the reasons listed.", "reason": "Users and regulators must be able to tell measured results from estimates; an assumption is never presented as measured performance.", "references": [{"label": "API Compendium (2009)", "location": "Section 4.6, Figure 4-2", "url": "https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf"}, {"label": "NUPRC directive on measurement-based methane/GHG reporting (11 April 2026)", "location": "Announcement", "url": "https://nuprcdemo.nuprc.gov.ng/media/news/b3f0614395dd79cd01ae509f"}]}, {"key": "excluded", "title": "Numbers deliberately not used", "decision": "The figure \"1 MMscf flared ≈ 55 tCO₂e\" is not used anywhere. API Table 4-12 factors are not used, because they are per unit of gas production, raw-gas feed or oil production, not per volume flared.", "reason": "Neither has a basis that matches measured flare volumes at Flame''s reference condition; applying them would mix activity bases.", "references": [{"label": "API Compendium (2009)", "location": "Table 4-12 and notes", "url": "https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf"}]}], "limitations": ["No uncertainty ranges are calculated yet.", "The production-based IPCC Tier 2 route and \"other gas release\" are not available in this edition.", "Results depend on the quality of the entered gas analysis and flare efficiency evidence; supporting documents are referenced, not yet uploaded.", "Flame does not claim regulatory compliance, independent verification or carbon-credit eligibility for any result."]}'::jsonb, 'DRAFT',
  'Values confirmed by the product owner on 2026-11-16 from the flare-calculator-helper reference, after checking the IPCC 2006 Vol. 2 Ch. 4 PDF, the API Compendium (2009) PDF and the GHG Protocol AR5 GWP table.',
  CURRENT_TIMESTAMP);

INSERT INTO "methodology_parameters" ("id", "editionId", "key", "kind", "name", "value", "unit", "gas", "appliesTo", "sourceOrganisation", "sourceDocument", "sourceEdition", "sourceLocation", "sourceUrl", "retrievedOn", "notes")
VALUES
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'conv.m3_per_mmscf', 'UNIT_CONVERSION'::"MethodologyParameterKind", 'Cubic metres per million standard cubic feet', 28316.846592, 'm³/MMscf', NULL, 'Converting volumes already standardised to 15 °C and 101.325 kPa (MMscf) into m³ at the same condition.', 'International Yard and Pound Agreement', 'Definition of the international foot: 1 ft = 0.3048 m exactly', '1959', '1 ft³ = 0.3048³ m³ = 0.028316846592 m³; 1 MMscf = 10⁶ ft³', NULL, DATE '2026-11-16', 'Exact by definition; no rounding.'),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'conv.kg_per_tonne', 'UNIT_CONVERSION'::"MethodologyParameterKind", 'Kilograms per tonne', 1000, 'kg/t', NULL, 'Converting kilograms to tonnes.', 'BIPM', 'The International System of Units (SI Brochure)', '9th edition (2019)', 'Table 8: tonne, 1 t = 10³ kg', 'https://www.bipm.org/en/publications/si-brochure', DATE '2026-11-16', 'Exact by definition.'),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'conv.tonnes_per_gg', 'UNIT_CONVERSION'::"MethodologyParameterKind", 'Tonnes per gigagram', 1000, 't/Gg', NULL, 'Converting IPCC factors in Gg to tonnes.', 'BIPM', 'The International System of Units (SI Brochure)', '9th edition (2019)', 'Table 7: prefix giga, G = 10⁹ (1 Gg = 10⁹ g = 10³ t)', 'https://www.bipm.org/en/publications/si-brochure', DATE '2026-11-16', 'Exact by definition.'),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'ipcc.molar_volume', 'CONSTANT'::"MethodologyParameterKind", 'Moles of gas per cubic metre at 15 °C and 101.325 kPa', 0.0423, 'kmol/m³', NULL, 'Converting a standardised gas volume to moles in every composition-based step.', 'IPCC', '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2: Energy, Chapter 4: Fugitive Emissions', '2006, corrected chapter as published on the IPCC NGGIP site (latest correction July 2023)', 'p. 4.45, definitions for Equations 4.2.3–4.2.5 ("42.3×10⁻³ kmol/m³")', 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf', DATE '2026-11-16', 'The exact ideal-gas value (101.325 ÷ (8.314462618 × 288.15)) is 0.0422932…; the IPCC constant is used because IPCC factors are derived from it (decision molar-volume).'),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'mw.ch4', 'MOLECULAR_WEIGHT'::"MethodologyParameterKind", 'Molecular weight of methane', 16.043, 'kg/kmol', 'CH4', 'Converting moles of CH₄ to mass.', 'IPCC', '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2: Energy, Chapter 4: Fugitive Emissions', '2006, corrected chapter as published on the IPCC NGGIP site (latest correction July 2023)', 'p. 4.45, definition of M_gas ("16.043 for CH4")', 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'mw.co2', 'MOLECULAR_WEIGHT'::"MethodologyParameterKind", 'Molecular weight of carbon dioxide', 44.011, 'kg/kmol', 'CO2', 'Converting moles of CO₂ to mass.', 'IPCC', '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2: Energy, Chapter 4: Fugitive Emissions', '2006, corrected chapter as published on the IPCC NGGIP site (latest correction July 2023)', 'p. 4.45, definition of M_gas ("44.011 for CO2")', 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'nc.methane', 'CARBON_NUMBER'::"MethodologyParameterKind", 'Carbon atoms per molecule of methane (CH₄)', 1, 'mol C/mol', NULL, 'Counting hydrocarbon carbon converted to CO₂ in flaring.', 'IPCC', '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2: Energy, Chapter 4: Fugitive Emissions', '2006, corrected chapter as published on the IPCC NGGIP site (latest correction July 2023)', 'p. 4.45, definition of N_C,i ("1 for CH4")', 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'nc.ethane', 'CARBON_NUMBER'::"MethodologyParameterKind", 'Carbon atoms per molecule of ethane (C₂H₆)', 2, 'mol C/mol', NULL, 'Counting hydrocarbon carbon converted to CO₂ in flaring.', 'IPCC', '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2: Energy, Chapter 4: Fugitive Emissions', '2006, corrected chapter as published on the IPCC NGGIP site (latest correction July 2023)', 'p. 4.45, definition of N_C,i ("2 for C2H6")', 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'nc.propane', 'CARBON_NUMBER'::"MethodologyParameterKind", 'Carbon atoms per molecule of propane (C₃H₈)', 3, 'mol C/mol', NULL, 'Counting hydrocarbon carbon converted to CO₂ in flaring.', 'IPCC', '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2: Energy, Chapter 4: Fugitive Emissions', '2006, corrected chapter as published on the IPCC NGGIP site (latest correction July 2023)', 'p. 4.45, definition of N_C,i ("3 for C3H8")', 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'nc.butane', 'CARBON_NUMBER'::"MethodologyParameterKind", 'Carbon atoms per molecule of butane (C₄H₁₀, iso and normal)', 4, 'mol C/mol', NULL, 'Counting hydrocarbon carbon converted to CO₂ in flaring.', 'American Petroleum Institute', 'Compendium of Greenhouse Gas Emissions Estimation Methodologies for the Oil and Natural Gas Industry', 'August 2009', 'Exhibit 4.9, p. 4-47 ("4 lbmole C per lbmole C4H10")', 'https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'nc.pentane', 'CARBON_NUMBER'::"MethodologyParameterKind", 'Carbon atoms per molecule of pentane (C₅H₁₂, iso and normal)', 5, 'mol C/mol', NULL, 'Counting hydrocarbon carbon converted to CO₂ in flaring.', 'IUPAC', 'Molecular formula of pentane isomers, C₅H₁₂', 'Standard chemical nomenclature', 'Five carbon atoms per molecule', NULL, DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'api.co2_conversion_default', 'DEFAULT_ASSUMPTION'::"MethodologyParameterKind", 'Default conversion of hydrocarbon carbon to CO₂ in a flare', 98, '%', NULL, 'Composition-based flaring when no test or vendor value exists and the default is chosen explicitly. Result labelled Estimated.', 'American Petroleum Institute', 'Compendium of Greenhouse Gas Emissions Estimation Methodologies for the Oil and Natural Gas Industry', 'August 2009', 'Section 4.6, p. 4-39, text before Equation 4-15 ("98% combustion efficiency")', 'https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'api.ch4_uncombusted_production', 'DEFAULT_ASSUMPTION'::"MethodologyParameterKind", 'Default uncombusted methane, production flares', 2, '%', 'CH4', 'Composition-based flaring at a flare marked Production, when the default is chosen explicitly. Result labelled Estimated.', 'American Petroleum Institute', 'Compendium of Greenhouse Gas Emissions Estimation Methodologies for the Oil and Natural Gas Industry', 'August 2009', 'Section 4.6, p. 4-40, text before Equation 4-16 ("2% noncombusted")', 'https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'api.ch4_uncombusted_refinery', 'DEFAULT_ASSUMPTION'::"MethodologyParameterKind", 'Default uncombusted methane, well-designed refinery flares', 0.5, '%', 'CH4', 'Composition-based flaring at a flare marked Refinery, when the default is chosen explicitly. Never for production flares. Result labelled Estimated.', 'American Petroleum Institute', 'Compendium of Greenhouse Gas Emissions Estimation Methodologies for the Oil and Natural Gas Industry', 'August 2009', 'Section 4.6, p. 4-40, text before Equation 4-16 ("0.5% residual, unburned CH4")', 'https://ww2.arb.ca.gov/sites/default/files/2020-04/API%20Compendium%202009.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'ipcc.direct.co2', 'EMISSION_FACTOR'::"MethodologyParameterKind", 'IPCC CO2 emission factor per volume of gas flared (reference case)', 2.0, 'Gg per 10⁶ m³ flared', 'CO2', 'IPCC reference-case flaring route only. Reference case: 98% flaring efficiency; gas 91.9% CH₄, 0.58% CO₂, 0.68% N₂, 6.84% NMHC by volume.', 'IPCC', '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2: Energy, Chapter 4: Fugitive Emissions', '2006, corrected chapter as published on the IPCC NGGIP site (latest correction July 2023)', 'Table 4.2.5, footnote e, p. 4.63 (same values in Table 4.2.4, footnote e, p. 4.54)', 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'ipcc.direct.ch4', 'EMISSION_FACTOR'::"MethodologyParameterKind", 'IPCC CH4 emission factor per volume of gas flared (reference case)', 0.012, 'Gg per 10⁶ m³ flared', 'CH4', 'IPCC reference-case flaring route only. Reference case: 98% flaring efficiency; gas 91.9% CH₄, 0.58% CO₂, 0.68% N₂, 6.84% NMHC by volume.', 'IPCC', '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2: Energy, Chapter 4: Fugitive Emissions', '2006, corrected chapter as published on the IPCC NGGIP site (latest correction July 2023)', 'Table 4.2.5, footnote e, p. 4.63 (same values in Table 4.2.4, footnote e, p. 4.54)', 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'ipcc.direct.n2o', 'EMISSION_FACTOR'::"MethodologyParameterKind", 'IPCC N2O emission factor per volume of gas flared (reference case)', 0.000023, 'Gg per 10⁶ m³ flared', 'N2O', 'N₂O on both flaring routes (no composition-based N₂O method exists in the references). Reference case: 98% flaring efficiency; gas 91.9% CH₄, 0.58% CO₂, 0.68% N₂, 6.84% NMHC by volume.', 'IPCC', '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2: Energy, Chapter 4: Fugitive Emissions', '2006, corrected chapter as published on the IPCC NGGIP site (latest correction July 2023)', 'Table 4.2.5, footnote e, p. 4.63 (same values in Table 4.2.4, footnote e, p. 4.54)', 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_4_Ch4_Fugitive_Emissions.pdf', DATE '2026-11-16', 'Confirmed by the product owner on 2026-11-16 after checking the source; API Compendium Tables 4-11/4-12 footnotes repeat 0.000023.'),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'gwp.co2', 'GWP'::"MethodologyParameterKind", '100-year global warming potential of CO2', 1, 'tCO₂e per t', 'CO2', 'Converting gas masses to tCO₂e.', 'IPCC', 'Fifth Assessment Report, WG1, Chapter 8 (Myhre et al., 2013), 100-year GWP', 'AR5 (2013)', 'Table 8.7, as tabulated in GHG Protocol "IPCC Global Warming Potential Values" v2.0 (7 Aug 2024)', 'https://ghgprotocol.org/sites/default/files/2024-08/Global-Warming-Potential-Values%20%28August%202024%29.pdf', DATE '2026-11-16', NULL),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'gwp.ch4', 'GWP'::"MethodologyParameterKind", '100-year global warming potential of CH4', 28, 'tCO₂e per t', 'CH4', 'Converting gas masses to tCO₂e.', 'IPCC', 'Fifth Assessment Report, WG1, Chapter 8 (Myhre et al., 2013), 100-year GWP', 'AR5 (2013)', 'Table 8.7, as tabulated in GHG Protocol "IPCC Global Warming Potential Values" v2.0 (7 Aug 2024)', 'https://ghgprotocol.org/sites/default/files/2024-08/Global-Warming-Potential-Values%20%28August%202024%29.pdf', DATE '2026-11-16', 'The AR5 value used by IPCC-based national inventories; the AR5 "fossil methane" value (30) is not used (decision gwp).'),
  (gen_random_uuid(), '019a8f00-0000-7000-8000-000000000001', 'gwp.n2o', 'GWP'::"MethodologyParameterKind", '100-year global warming potential of N2O', 265, 'tCO₂e per t', 'N2O', 'Converting gas masses to tCO₂e.', 'IPCC', 'Fifth Assessment Report, WG1, Chapter 8 (Myhre et al., 2013), 100-year GWP', 'AR5 (2013)', 'Table 8.7, as tabulated in GHG Protocol "IPCC Global Warming Potential Values" v2.0 (7 Aug 2024)', 'https://ghgprotocol.org/sites/default/files/2024-08/Global-Warming-Potential-Values%20%28August%202024%29.pdf', DATE '2026-11-16', NULL);

COMMIT;
