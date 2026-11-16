-- Milestone 4: review and approval statuses. See docs/architecture/ARCHITECTURAL_WORKFLOW.md §7.1.
-- Separate from the workflow migration because PostgreSQL does not allow new enum values
-- to be used in the transaction that adds them. Wrapped so it applies completely or not at all.
BEGIN;

ALTER TYPE "ActivityRecordStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "ActivityRecordStatus" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "ActivityRecordStatus" ADD VALUE 'NEEDS_CORRECTION';
ALTER TYPE "ActivityRecordStatus" ADD VALUE 'AWAITING_APPROVAL';
ALTER TYPE "ActivityRecordStatus" ADD VALUE 'APPROVED';
ALTER TYPE "ActivityRecordStatus" ADD VALUE 'REJECTED';
ALTER TYPE "ActivityRecordStatus" ADD VALUE 'SUPERSEDED';

COMMIT;
