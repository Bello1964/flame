-- Milestone 6 review follow-up: uses the CANCELLED email status added by the previous
-- migration. See docs/architecture/ARCHITECTURAL_WORKFLOW.md §7.2.
-- Wrapped so it applies completely or not at all.
BEGIN;

-- Emails cancelled before this status existed were recorded as FAILED with a note.
UPDATE "email_outbox"
   SET "status" = 'CANCELLED',
       "lastError" = btrim(substr("lastError", length('Cancelled:') + 1))
 WHERE "status" = 'FAILED'
   AND "lastError" LIKE 'Cancelled:%';

-- A cancelled email belongs to an invitation and never left the outbox; neither it nor a
-- finally failed one may still hold the accept link.
ALTER TABLE "email_outbox"
  ADD CONSTRAINT "email_outbox_cancelled_check" CHECK (
    "status" <> 'CANCELLED' OR ("invitationId" IS NOT NULL AND "sentAt" IS NULL AND "providerMessageId" IS NULL)
  ),
  ADD CONSTRAINT "email_outbox_link_erased_check" CHECK (
    "status" NOT IN ('FAILED', 'CANCELLED') OR NOT ("payload" ? 'link')
  );

COMMIT;
