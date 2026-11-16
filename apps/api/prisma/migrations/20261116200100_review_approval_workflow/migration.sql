-- Milestone 4: review and approval workflow, revisions and the append-only record history.
-- See docs/architecture/ARCHITECTURAL_WORKFLOW.md §7.1. Wrapped so it applies completely or not at all.
BEGIN;

-- CreateEnum
CREATE TYPE "ActivityRecordEventType" AS ENUM ('CREATED', 'EDITED', 'SUBMITTED', 'RECALLED', 'REVIEW_STARTED', 'CLAIM_RELEASED', 'FORWARDED', 'RETURNED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REVISION_CREATED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "activity_records" ADD COLUMN     "approvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "claimedAt" TIMESTAMPTZ(3),
ADD COLUMN     "claimedById" UUID,
ADD COLUMN     "revisionOfId" UUID,
ADD COLUMN     "submittedAt" TIMESTAMPTZ(3),
ADD COLUMN     "supersededAt" TIMESTAMPTZ(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "activity_record_events" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "activityRecordId" UUID NOT NULL,
    "type" "ActivityRecordEventType" NOT NULL,
    "fromStatus" "ActivityRecordStatus",
    "toStatus" "ActivityRecordStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" VARCHAR(2000),
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_record_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_record_events_organisationId_activityRecordId_crea_idx" ON "activity_record_events"("organisationId", "activityRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_records_organisationId_revisionOfId_idx" ON "activity_records"("organisationId", "revisionOfId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_records_organisationId_id_key" ON "activity_records"("organisationId", "id");

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_records" ADD CONSTRAINT "activity_records_organisationId_revisionOfId_fkey" FOREIGN KEY ("organisationId", "revisionOfId") REFERENCES "activity_records"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_record_events" ADD CONSTRAINT "activity_record_events_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_record_events" ADD CONSTRAINT "activity_record_events_organisationId_activityRecordId_fkey" FOREIGN KEY ("organisationId", "activityRecordId") REFERENCES "activity_records"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_record_events" ADD CONSTRAINT "activity_record_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ─── Database-level safeguards ──────────────────────────────────────────────
-- These hold even if application code has a bug.

ALTER TABLE "activity_records"
  -- A claim exists exactly while a reviewer holds the record.
  ADD CONSTRAINT "activity_records_claim_check" CHECK (
    ("status" = 'UNDER_REVIEW') = ("claimedById" IS NOT NULL)
    AND ("claimedById" IS NULL) = ("claimedAt" IS NULL)
  ),
  -- Approved and superseded records always say when and by whom they were approved.
  ADD CONSTRAINT "activity_records_approval_check" CHECK (
    ("status" IN ('APPROVED', 'SUPERSEDED')) = ("approvedAt" IS NOT NULL)
    AND ("approvedAt" IS NULL) = ("approvedById" IS NULL)
  ),
  ADD CONSTRAINT "activity_records_superseded_check" CHECK (
    ("status" = 'SUPERSEDED') = ("supersededAt" IS NOT NULL)
  ),
  -- A first version has no predecessor; a revision always has one, and never itself.
  ADD CONSTRAINT "activity_records_version_check" CHECK (
    "version" >= 1
    AND ("revisionOfId" IS NULL) = ("version" = 1)
    AND ("revisionOfId" IS NULL OR "revisionOfId" <> "id")
  );

-- At most one open revision of a record at a time.
CREATE UNIQUE INDEX "activity_records_one_open_revision"
  ON "activity_records" ("revisionOfId")
  WHERE "revisionOfId" IS NOT NULL
    AND "status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'AWAITING_APPROVAL');

-- Records are never deleted (by anyone), always start as drafts, only move along the
-- workflow's legal transitions, and their values can only change while editable
-- (DRAFT or NEEDS_CORRECTION). Approved, superseded, rejected and withdrawn records
-- are frozen apart from APPROVED -> SUPERSEDED.
CREATE FUNCTION "activity_records_guard"() RETURNS trigger AS $$
DECLARE
  workflow_columns text[] := ARRAY[
    'status', 'updatedById', 'updatedAt', 'withdrawnAt', 'withdrawnById', 'withdrawalReason',
    'submittedAt', 'claimedById', 'claimedAt', 'approvedAt', 'approvedById', 'supersededAt'
  ];
  transition text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'activity_records are never deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status"::text <> 'DRAFT' THEN
      RAISE EXCEPTION 'activity records start as DRAFT (got %)', NEW."status";
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status"::text NOT IN ('DRAFT', 'NEEDS_CORRECTION')
     AND (to_jsonb(NEW) - workflow_columns) IS DISTINCT FROM (to_jsonb(OLD) - workflow_columns) THEN
    RAISE EXCEPTION 'activity record % is %, so its values cannot change', OLD."id", OLD."status";
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    transition := OLD."status"::text || '>' || NEW."status"::text;
    IF transition NOT IN (
      'DRAFT>SUBMITTED', 'DRAFT>WITHDRAWN',
      'SUBMITTED>DRAFT', 'SUBMITTED>UNDER_REVIEW',
      'UNDER_REVIEW>SUBMITTED', 'UNDER_REVIEW>AWAITING_APPROVAL', 'UNDER_REVIEW>NEEDS_CORRECTION',
      'AWAITING_APPROVAL>APPROVED', 'AWAITING_APPROVAL>REJECTED', 'AWAITING_APPROVAL>NEEDS_CORRECTION',
      'NEEDS_CORRECTION>SUBMITTED', 'NEEDS_CORRECTION>WITHDRAWN',
      'APPROVED>SUPERSEDED'
    ) THEN
      RAISE EXCEPTION 'activity record % cannot move from % to %', OLD."id", OLD."status", NEW."status";
    END IF;
  ELSIF OLD."status"::text IN ('APPROVED', 'SUPERSEDED', 'REJECTED', 'WITHDRAWN')
        AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'activity record % is %, so it cannot change', OLD."id", OLD."status";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "activity_records_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "activity_records"
  FOR EACH ROW EXECUTE FUNCTION "activity_records_guard"();

REVOKE DELETE ON "activity_records" FROM flame_app;

-- The record history is append-only, like the audit log: the app role may only add
-- and read entries, and triggers reject changes even from the schema owner.
CREATE FUNCTION "activity_record_events_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_record_events is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "activity_record_events_append_only"
  BEFORE UPDATE OR DELETE ON "activity_record_events"
  FOR EACH ROW EXECUTE FUNCTION "activity_record_events_append_only"();

CREATE TRIGGER "activity_record_events_no_truncate"
  BEFORE TRUNCATE ON "activity_record_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "activity_record_events_append_only"();

REVOKE UPDATE, DELETE, TRUNCATE ON "activity_record_events" FROM flame_app;

-- ─── History for records entered before this milestone ──────────────────────
-- Built from facts already stored: who created each record, every audited edit, and
-- withdrawals. Involvement (§7.1) is read from this history.
INSERT INTO "activity_record_events"
  ("id", "organisationId", "activityRecordId", "type", "fromStatus", "toStatus", "actorId", "details", "createdAt")
SELECT gen_random_uuid(), r."organisationId", r."id", 'CREATED', NULL, 'DRAFT', r."createdById",
       '{"backfilled": true}'::jsonb, r."createdAt"
  FROM "activity_records" r;

INSERT INTO "activity_record_events"
  ("id", "organisationId", "activityRecordId", "type", "fromStatus", "toStatus", "actorId", "details", "createdAt")
SELECT gen_random_uuid(), r."organisationId", r."id", 'EDITED', 'DRAFT', 'DRAFT', a."actorUserId",
       jsonb_build_object('backfilled', true, 'auditLogId', a."id"), a."createdAt"
  FROM "audit_logs" a
  JOIN "activity_records" r ON r."id" = a."entityId" AND r."organisationId" = a."organisationId"
 WHERE a."entityType" = 'ActivityRecord'
   AND a."action" = 'activity_record.updated'
   AND a."actorUserId" IS NOT NULL;

INSERT INTO "activity_record_events"
  ("id", "organisationId", "activityRecordId", "type", "fromStatus", "toStatus", "actorId", "comment", "details", "createdAt")
SELECT gen_random_uuid(), r."organisationId", r."id", 'WITHDRAWN', 'DRAFT', 'WITHDRAWN', r."withdrawnById",
       r."withdrawalReason", '{"backfilled": true}'::jsonb, r."withdrawnAt"
  FROM "activity_records" r
 WHERE r."status" = 'WITHDRAWN';

COMMIT;
