-- Milestone 4 review follow-up: a stricter guard on activity_records (defence in depth;
-- the API never makes these changes). See docs/architecture/ARCHITECTURAL_WORKFLOW.md §7.1.
--   1. Identity and lineage never change after insert: organisation, flare source, kind,
--      creator, creation time, the record it revises and its version.
--   2. Who approved a record, and when, can't be rewritten (including on supersede).
--   3. Claim and submission fields change only together with a status change, so a
--      review can't be moved to another reviewer without a recorded step.
-- Note: activity_records_one_open_revision (previous migration) is a partial index that
-- schema.prisma can't express. Prisma 7 leaves it alone: `prisma migrate diff` from the
-- migrated database to the schema is empty (checked 2026-11-16).
-- Wrapped so it applies completely or not at all.
BEGIN;

CREATE OR REPLACE FUNCTION "activity_records_guard"() RETURNS trigger AS $$
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

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
     OR NEW."flareSourceId" IS DISTINCT FROM OLD."flareSourceId"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."revisionOfId" IS DISTINCT FROM OLD."revisionOfId"
     OR NEW."version" IS DISTINCT FROM OLD."version" THEN
    RAISE EXCEPTION 'activity record %: identity and lineage cannot change', OLD."id";
  END IF;

  IF OLD."status"::text NOT IN ('DRAFT', 'NEEDS_CORRECTION')
     AND (to_jsonb(NEW) - workflow_columns) IS DISTINCT FROM (to_jsonb(OLD) - workflow_columns) THEN
    RAISE EXCEPTION 'activity record % is %, so its values cannot change', OLD."id", OLD."status";
  END IF;

  IF OLD."status"::text = 'APPROVED'
     AND (NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
          OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById") THEN
    RAISE EXCEPTION 'activity record %: who approved it, and when, cannot change', OLD."id";
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
  ELSE
    IF NEW."claimedById" IS DISTINCT FROM OLD."claimedById"
       OR NEW."claimedAt" IS DISTINCT FROM OLD."claimedAt"
       OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt" THEN
      RAISE EXCEPTION 'activity record %: claim and submission change only with a status change', OLD."id";
    END IF;
    IF OLD."status"::text IN ('APPROVED', 'SUPERSEDED', 'REJECTED', 'WITHDRAWN')
       AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'activity record % is %, so it cannot change', OLD."id", OLD."status";
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
