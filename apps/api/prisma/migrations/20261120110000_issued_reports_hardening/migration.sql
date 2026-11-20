-- Review follow-up for issued NUPRC reports (§8.3): approval, rejection and submission fields
-- must be complete together, a submission needs an approved report, and once recorded who
-- recorded a submission (and when a version was superseded) never changes.
-- Wrapped so it applies completely or not at all.
BEGIN;

ALTER TABLE "issued_reports"
  ADD CONSTRAINT "issued_reports_approval_fields_check"
    CHECK (("approvedById" IS NULL) = ("approvedAt" IS NULL)),
  ADD CONSTRAINT "issued_reports_rejection_fields_check"
    CHECK (("rejectedById" IS NULL) = ("rejectedAt" IS NULL)
           AND ("rejectedById" IS NULL) = ("rejectionComment" IS NULL)),
  ADD CONSTRAINT "issued_reports_submission_status_check"
    CHECK ("submittedOn" IS NULL OR "status" IN ('APPROVED', 'SUPERSEDED'));

CREATE OR REPLACE FUNCTION "issued_reports_guard"() RETURNS trigger AS $$
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
     OR NEW."submissionReference" IS DISTINCT FROM OLD."submissionReference"
     OR NEW."submissionRecordedById" IS DISTINCT FROM OLD."submissionRecordedById"
     OR NEW."submissionRecordedAt" IS DISTINCT FROM OLD."submissionRecordedAt") THEN
    RAISE EXCEPTION 'issued report %: its recorded submission cannot change', OLD."id";
  END IF;
  IF OLD."supersededAt" IS NOT NULL AND NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt" THEN
    RAISE EXCEPTION 'issued report %: when it was superseded cannot change', OLD."id";
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

COMMIT;
