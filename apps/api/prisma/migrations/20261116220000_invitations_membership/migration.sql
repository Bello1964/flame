-- Milestone 6: invitations, membership management, the email outbox and the supreme
-- Platform Administrator. See docs/architecture/ARCHITECTURAL_WORKFLOW.md §6 and §7.2.
-- Wrapped so it applies completely or not at all. The new MembershipStatus value REMOVED
-- is not used anywhere in this migration: PostgreSQL does not allow a new enum value to
-- be used in the transaction that adds it.
BEGIN;

-- CreateEnum
CREATE TYPE "InvitationKind" AS ENUM ('ORGANISATION', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EmailTemplate" AS ENUM ('ORGANISATION_INVITATION', 'PLATFORM_ADMIN_INVITATION');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailTransport" AS ENUM ('RESEND', 'DEV_MAILBOX', 'MEMORY');

-- AlterEnum
ALTER TYPE "MembershipStatus" ADD VALUE 'REMOVED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isSupremeAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "kind" "InvitationKind" NOT NULL,
    "organisationId" UUID,
    "email" VARCHAR(320) NOT NULL,
    "roles" "Role"[],
    "tokenHash" CHAR(64) NOT NULL,
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedById" UUID,
    "respondedAt" TIMESTAMPTZ(3),
    "revokedById" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "template" "EmailTemplate" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(500),
    "sentAt" TIMESTAMPTZ(3),
    "transport" "EmailTransport",
    "providerMessageId" VARCHAR(200),
    "invitationId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_organisationId_status_idx" ON "invitations"("organisationId", "status");

-- CreateIndex
CREATE INDEX "invitations_kind_status_idx" ON "invitations"("kind", "status");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "email_outbox_status_nextAttemptAt_idx" ON "email_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "email_outbox_invitationId_idx" ON "email_outbox"("invitationId");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "invitations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── Hand-written safeguards (not expressible in Prisma schema) ─────────────

-- Supreme Platform Administrator: at most one, and always a Platform Administrator.
ALTER TABLE "users"
  ADD CONSTRAINT "users_supreme_admin_check" CHECK (NOT "isSupremeAdmin" OR "isPlatformAdmin");
CREATE UNIQUE INDEX "users_one_supreme_admin" ON "users" ("isSupremeAdmin") WHERE "isSupremeAdmin";

-- Invitations: scope, normalised email, and fields tied to their states.
ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_scope_check" CHECK (
    "roles" IS NOT NULL
    AND array_position("roles", NULL) IS NULL
    AND (
      ("kind" = 'ORGANISATION' AND "organisationId" IS NOT NULL AND cardinality("roles") > 0)
      OR ("kind" = 'PLATFORM_ADMIN' AND "organisationId" IS NULL AND cardinality("roles") = 0)
    )
  ),
  ADD CONSTRAINT "invitations_email_check" CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
  ADD CONSTRAINT "invitations_expiry_check" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "invitations_accepted_check" CHECK (("status" = 'ACCEPTED') = ("acceptedById" IS NOT NULL)),
  ADD CONSTRAINT "invitations_responded_check" CHECK (("status" IN ('ACCEPTED', 'DECLINED')) = ("respondedAt" IS NOT NULL)),
  ADD CONSTRAINT "invitations_revoked_check" CHECK (("status" = 'REVOKED') = ("revokedById" IS NOT NULL AND "revokedAt" IS NOT NULL));

-- At most one PENDING invitation per organisation and email, and one PENDING Platform
-- Administrator invitation per email. Separate partial indexes, because organisationId is
-- NULL for platform invitations and NULLs never clash in a unique index. An expired row
-- still PENDING is flipped to EXPIRED before a new invitation is created.
CREATE UNIQUE INDEX "invitations_one_pending_per_organisation"
  ON "invitations" ("organisationId", "email")
  WHERE "status" = 'PENDING' AND "kind" = 'ORGANISATION';
CREATE UNIQUE INDEX "invitations_one_pending_platform_admin"
  ON "invitations" ("email")
  WHERE "status" = 'PENDING' AND "kind" = 'PLATFORM_ADMIN';

-- Invitations are never deleted; what was offered never changes; only a PENDING
-- invitation changes state, and a final one never changes again.
CREATE FUNCTION "invitations_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invitations are never deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status"::text <> 'PENDING' THEN
      RAISE EXCEPTION 'invitations start as PENDING (got %)', NEW."status";
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
     OR NEW."email" IS DISTINCT FROM OLD."email"
     OR NEW."roles" IS DISTINCT FROM OLD."roles"
     OR NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash"
     OR NEW."invitedById" IS DISTINCT FROM OLD."invitedById"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'invitation %: what was offered cannot change', OLD."id";
  END IF;
  IF OLD."status"::text <> 'PENDING' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'invitation % is %, so it cannot change', OLD."id", OLD."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invitations_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "invitations"
  FOR EACH ROW EXECUTE FUNCTION "invitations_guard"();

-- Email outbox: consistent delivery fields.
ALTER TABLE "email_outbox"
  ADD CONSTRAINT "email_outbox_recipient_check" CHECK ("recipient" = lower(btrim("recipient")) AND "recipient" <> ''),
  ADD CONSTRAINT "email_outbox_attempts_check" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "email_outbox_sending_check" CHECK (("status" = 'SENDING') = ("claimedAt" IS NOT NULL)),
  ADD CONSTRAINT "email_outbox_sent_check" CHECK (("status" = 'SENT') = ("sentAt" IS NOT NULL AND "transport" IS NOT NULL));

-- Memberships are never deleted: removal is the REMOVED status, and a new invitation
-- reactivates the same row.
CREATE FUNCTION "memberships_prevent_delete"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'memberships are never deleted; set the status to REMOVED';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "memberships_no_delete"
  BEFORE DELETE ON "memberships"
  FOR EACH ROW EXECUTE FUNCTION "memberships_prevent_delete"();

-- App role: new tables received CRUD through default privileges. Nothing here is ever
-- deleted (outbox rows are kept; their links are erased after delivery).
REVOKE DELETE ON "memberships", "invitations", "email_outbox" FROM flame_app;

COMMIT;
