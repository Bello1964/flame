-- NUPRC reports: optional fields NUPRC's templates ask for, and issued (frozen) reports.
-- See docs/architecture/ARCHITECTURAL_WORKFLOW.md §8.3. Wrapped so it applies completely or
-- not at all.
BEGIN;

-- CreateEnum
CREATE TYPE "FacilityTerrain" AS ENUM ('ONSHORE', 'OFFSHORE');
CREATE TYPE "NuprcFacilityType" AS ENUM ('CPF', 'FLOWSTATION', 'WELLPAD', 'PLATFORM', 'FSO', 'FPSO');
CREATE TYPE "FacilitySegment" AS ENUM ('OIL', 'GAS', 'OIL_AND_GAS');
CREATE TYPE "NuprcReportKind" AS ENUM ('QUARTERLY_GHG_INVENTORY', 'MONTHLY_FLARE_VENT_LOG');
CREATE TYPE "IssuedReportStatus" AS ENUM ('AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN "abbreviation" VARCHAR(20);

ALTER TABLE "facilities"
  ADD COLUMN "terrain" "FacilityTerrain",
  ADD COLUMN "concession" VARCHAR(100),
  ADD COLUMN "fieldName" VARCHAR(200),
  ADD COLUMN "facilityType" "NuprcFacilityType",
  ADD COLUMN "segment" "FacilitySegment";

-- Editable like the other values of a draft; frozen with them afterwards (the existing
-- activity_records_guard compares whole rows).
ALTER TABLE "activity_records"
  ADD COLUMN "startTime" VARCHAR(5),
  ADD COLUMN "gasSource" VARCHAR(200);

ALTER TABLE "activity_records"
  ADD CONSTRAINT "activity_records_start_time_check"
  CHECK ("startTime" IS NULL OR "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "organisations"
  ADD CONSTRAINT "organisations_abbreviation_check"
  CHECK ("abbreviation" IS NULL OR btrim("abbreviation") <> '');

-- CreateTable
CREATE TABLE "issued_reports" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "kind" "NuprcReportKind" NOT NULL,
    "periodKey" VARCHAR(10) NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "IssuedReportStatus" NOT NULL DEFAULT 'AWAITING_APPROVAL',
    "snapshot" JSONB NOT NULL,
    "reason" VARCHAR(2000),
    "issuedById" UUID NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "rejectedById" UUID,
    "rejectedAt" TIMESTAMPTZ(3),
    "rejectionComment" VARCHAR(2000),
    "supersededAt" TIMESTAMPTZ(3),
    "submittedOn" DATE,
    "submissionReference" VARCHAR(200),
    "submissionRecordedById" UUID,
    "submissionRecordedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "issued_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "issued_reports_organisationId_kind_periodKey_version_key"
  ON "issued_reports"("organisationId", "kind", "periodKey", "version");
CREATE INDEX "issued_reports_organisationId_kind_periodKey_idx"
  ON "issued_reports"("organisationId", "kind", "periodKey");

ALTER TABLE "issued_reports" ADD CONSTRAINT "issued_reports_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "issued_reports" ADD CONSTRAINT "issued_reports_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "issued_reports" ADD CONSTRAINT "issued_reports_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "issued_reports" ADD CONSTRAINT "issued_reports_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "issued_reports" ADD CONSTRAINT "issued_reports_submissionRecordedById_fkey" FOREIGN KEY ("submissionRecordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── Hand-written safeguards ─────────────────────────────────────────────────

ALTER TABLE "issued_reports"
  ADD CONSTRAINT "issued_reports_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "issued_reports_reason_check" CHECK ("version" = 1 OR btrim(coalesce("reason", '')) <> ''),
  ADD CONSTRAINT "issued_reports_period_check" CHECK (
    ("kind" = 'QUARTERLY_GHG_INVENTORY' AND "periodKey" ~ '^[0-9]{4}-Q[1-4]$')
    OR ("kind" = 'MONTHLY_FLARE_VENT_LOG' AND "periodKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
  ),
  ADD CONSTRAINT "issued_reports_approved_check" CHECK (
    ("status" IN ('APPROVED', 'SUPERSEDED')) = ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "issued_reports_rejected_check" CHECK (
    ("status" = 'REJECTED') = ("rejectedById" IS NOT NULL AND "rejectedAt" IS NOT NULL AND "rejectionComment" IS NOT NULL)
  ),
  ADD CONSTRAINT "issued_reports_superseded_check" CHECK (("status" = 'SUPERSEDED') = ("supersededAt" IS NOT NULL)),
  -- Separation of duties: whoever issued a report never approves or rejects it.
  ADD CONSTRAINT "issued_reports_separation_check" CHECK (
    ("approvedById" IS NULL OR "approvedById" <> "issuedById")
    AND ("rejectedById" IS NULL OR "rejectedById" <> "issuedById")
  ),
  ADD CONSTRAINT "issued_reports_submission_check" CHECK (
    ("submittedOn" IS NULL) = ("submissionRecordedById" IS NULL AND "submissionRecordedAt" IS NULL)
    AND ("submittedOn" IS NULL OR "approvedById" IS NOT NULL)
    AND ("submissionReference" IS NULL OR "submittedOn" IS NOT NULL)
  );

-- At most one report awaiting approval, and one approved, per organisation, kind and period.
CREATE UNIQUE INDEX "issued_reports_one_awaiting"
  ON "issued_reports" ("organisationId", "kind", "periodKey") WHERE "status" = 'AWAITING_APPROVAL';
CREATE UNIQUE INDEX "issued_reports_one_approved"
  ON "issued_reports" ("organisationId", "kind", "periodKey") WHERE "status" = 'APPROVED';

-- What was issued never changes; status only moves forward; issued reports are never deleted.
CREATE FUNCTION "issued_reports_guard"() RETURNS trigger AS $$
DECLARE
  transition text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'issued reports are never deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status"::text <> 'AWAITING_APPROVAL' THEN
      RAISE EXCEPTION 'issued reports start as AWAITING_APPROVAL (got %)', NEW."status";
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."periodKey" IS DISTINCT FROM OLD."periodKey"
     OR NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR NEW."issuedById" IS DISTINCT FROM OLD."issuedById"
     OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt" THEN
    RAISE EXCEPTION 'issued report %: what was issued cannot change', OLD."id";
  END IF;
  IF OLD."approvedAt" IS NOT NULL AND (NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
     OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById") THEN
    RAISE EXCEPTION 'issued report %: who approved it, and when, cannot change', OLD."id";
  END IF;
  IF OLD."submittedOn" IS NOT NULL AND (NEW."submittedOn" IS DISTINCT FROM OLD."submittedOn"
     OR NEW."submissionReference" IS DISTINCT FROM OLD."submissionReference") THEN
    RAISE EXCEPTION 'issued report %: its recorded submission cannot change', OLD."id";
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    transition := OLD."status"::text || '>' || NEW."status"::text;
    IF transition NOT IN (
      'AWAITING_APPROVAL>APPROVED', 'AWAITING_APPROVAL>REJECTED', 'APPROVED>SUPERSEDED'
    ) THEN
      RAISE EXCEPTION 'issued report % cannot move from % to %', OLD."id", OLD."status", NEW."status";
    END IF;
  ELSIF OLD."status"::text = 'REJECTED' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'issued report % is REJECTED, so it cannot change', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issued_reports_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "issued_reports"
  FOR EACH ROW EXECUTE FUNCTION "issued_reports_guard"();

-- Row-Level Security, as for the other organisation tables (§11).
ALTER TABLE "issued_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "issued_reports"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

-- App role: CRUD came through default privileges; issued reports are never deleted.
REVOKE DELETE ON "issued_reports" FROM flame_app;

COMMIT;
