-- Milestone 7: password reset links and account notices. See
-- docs/architecture/ARCHITECTURAL_WORKFLOW.md §7.3.
-- The new EmailTemplate values are only added here, never used in this transaction.
-- Wrapped so it applies completely or not at all.
BEGIN;

-- AlterEnum
ALTER TYPE "EmailTemplate" ADD VALUE 'PASSWORD_RESET';
ALTER TYPE "EmailTemplate" ADD VALUE 'PASSWORD_CHANGED';

-- CreateEnum
CREATE TYPE "PasswordResetStatus" AS ENUM ('PENDING', 'USED', 'CANCELLED');

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "status" "PasswordResetStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "email_outbox" ADD COLUMN "passwordResetId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");

-- CreateIndex
CREATE INDEX "password_resets_userId_status_idx" ON "password_resets"("userId", "status");

-- CreateIndex
CREATE INDEX "email_outbox_passwordResetId_idx" ON "email_outbox"("passwordResetId");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_passwordResetId_fkey" FOREIGN KEY ("passwordResetId") REFERENCES "password_resets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── Hand-written safeguards (not expressible in Prisma schema) ─────────────

ALTER TABLE "password_resets"
  ADD CONSTRAINT "password_resets_expiry_check" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "password_resets_used_check" CHECK (("status" = 'USED') = ("usedAt" IS NOT NULL));

-- At most one usable link per account: a new request cancels the previous one first.
CREATE UNIQUE INDEX "password_resets_one_pending_per_user"
  ON "password_resets" ("userId") WHERE "status" = 'PENDING';

-- An email belongs to an invitation or a reset link, never both. A cancelled email
-- belongs to one of them (previously: always an invitation) and never left the outbox.
ALTER TABLE "email_outbox"
  ADD CONSTRAINT "email_outbox_single_subject_check"
  CHECK ("invitationId" IS NULL OR "passwordResetId" IS NULL),
  DROP CONSTRAINT "email_outbox_cancelled_check",
  ADD CONSTRAINT "email_outbox_cancelled_check" CHECK (
    "status" <> 'CANCELLED'
    OR (("invitationId" IS NOT NULL OR "passwordResetId" IS NOT NULL)
        AND "sentAt" IS NULL AND "providerMessageId" IS NULL)
  );

-- Reset links only move forward: PENDING to USED or CANCELLED, and what was issued
-- (account, token, expiry) never changes. They are never deleted.
CREATE FUNCTION "password_resets_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'password resets are never deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status"::text <> 'PENDING' THEN
      RAISE EXCEPTION 'password resets start as PENDING (got %)', NEW."status";
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'password reset %: what was issued cannot change', OLD."id";
  END IF;
  IF OLD."status"::text <> 'PENDING' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'password reset % is %, so it cannot change', OLD."id", OLD."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "password_resets_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "password_resets"
  FOR EACH ROW EXECUTE FUNCTION "password_resets_guard"();

-- App role: the new table received CRUD through default privileges. Nothing here is ever
-- deleted.
REVOKE DELETE ON "password_resets" FROM flame_app;

COMMIT;
