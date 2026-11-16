-- Milestone 3 review follow-up: a stricter guard on calculations (defence in depth; the
-- API never makes these changes). See docs/architecture/ARCHITECTURAL_WORKFLOW.md §8.1.
--   1. Whoever ran a calculation never approves it (as for methodology editions).
--   2. The submission time changes only when a calculation is submitted, and the review
--      claim only when a review starts, is released, forwarded or rejected.
-- Wrapped so it applies completely or not at all.
BEGIN;

ALTER TABLE "calculations"
  ADD CONSTRAINT "calculations_two_person_check" CHECK ("approvedById" IS DISTINCT FROM "createdById");

CREATE OR REPLACE FUNCTION "calculations_guard"() RETURNS trigger AS $$
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
    IF NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt" AND transition <> 'CALCULATED>SUBMITTED' THEN
      RAISE EXCEPTION 'calculation %: the submission time changes only on submission', OLD."id";
    END IF;
    IF (NEW."claimedById" IS DISTINCT FROM OLD."claimedById" OR NEW."claimedAt" IS DISTINCT FROM OLD."claimedAt")
       AND OLD."status"::text <> 'UNDER_REVIEW' AND NEW."status"::text <> 'UNDER_REVIEW' THEN
      RAISE EXCEPTION 'calculation %: the review claim changes only when a review starts or ends', OLD."id";
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

COMMIT;
