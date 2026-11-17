-- Milestone 6 review follow-up: record which Owner invitations a Platform Administrator
-- issued (new organisation, or reviving a dormant one). Such an invitation can be accepted
-- only while the organisation is still dormant. See ARCHITECTURAL_WORKFLOW.md §7.2.
-- Wrapped so it applies completely or not at all.
BEGIN;

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "issuedByPlatform" BOOLEAN NOT NULL DEFAULT false;

-- Pending Owner invitations issued before this column existed by a Platform Administrator
-- who is not a member of the organisation can only have come from the platform endpoints.
-- (Final invitations are frozen by the guard trigger and don't need it.)
UPDATE "invitations" i
   SET "issuedByPlatform" = true
  FROM "users" u
 WHERE u."id" = i."invitedById"
   AND u."isPlatformAdmin"
   AND i."status" = 'PENDING'
   AND i."kind" = 'ORGANISATION'
   AND 'ORGANISATION_OWNER' = ANY (i."roles")
   AND NOT EXISTS (
     SELECT 1 FROM "memberships" m
      WHERE m."userId" = i."invitedById" AND m."organisationId" = i."organisationId"
   );

-- Only organisation invitations that grant the Owner role are issued by the platform.
ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_issued_by_platform_check" CHECK (
    NOT "issuedByPlatform"
    OR ("kind" = 'ORGANISATION' AND 'ORGANISATION_OWNER' = ANY ("roles"))
  );

-- The guard now also keeps issuedByPlatform immutable (otherwise unchanged).
CREATE OR REPLACE FUNCTION "invitations_guard"() RETURNS trigger AS $$
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
     OR NEW."issuedByPlatform" IS DISTINCT FROM OLD."issuedByPlatform"
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

COMMIT;
