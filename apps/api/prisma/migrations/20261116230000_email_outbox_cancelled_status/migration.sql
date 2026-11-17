-- Milestone 6 review follow-up: a CANCELLED status for outbox emails that were never sent
-- because their invitation was revoked, declined or accepted first (previously FAILED with
-- a "Cancelled:" note). See docs/architecture/ARCHITECTURAL_WORKFLOW.md §7.2.
-- Separate from the next migration because PostgreSQL does not allow a new enum value to
-- be used in the transaction that adds it. Wrapped so it applies completely or not at all.
BEGIN;

ALTER TYPE "EmailStatus" ADD VALUE 'CANCELLED';

COMMIT;
