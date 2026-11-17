-- Milestone 8: PostgreSQL Row-Level Security on every table that holds organisation data,
-- as defence in depth behind the API's own tenant checks. See
-- docs/architecture/ARCHITECTURAL_WORKFLOW.md §11.
--
-- The API sets two transaction-local settings on every query (apps/api/src/lib/prisma.ts):
--   flame.scope            'organisation', 'system' or unset
--   flame.organisation_id  the organisation's id when the scope is 'organisation'
-- Without a scope no organisation rows are visible and none can be written (fail closed).
--
-- RLS is ENABLED, not FORCED: the table owner (migrations, seeding as owner, the test reset)
-- is unaffected. The API's role owns no table and has no BYPASSRLS (the API checks its role
-- at startup and db:create-app-user refuses such a role), so the policies always apply to it.
-- Referential-integrity checks are not subject to RLS, so composite foreign keys keep working.
-- Wrapped so it applies completely or not at all.
BEGIN;

-- Whether the current scope may see or write a row of this organisation.
CREATE FUNCTION "flame_rls_allows"("org" uuid) RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT CASE current_setting('flame.scope', true)
    WHEN 'system' THEN true
    WHEN 'organisation' THEN
      COALESCE("org" = NULLIF(current_setting('flame.organisation_id', true), '')::uuid, false)
    ELSE false
  END
$$;

-- Organisations: their own row.
ALTER TABLE "organisations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "organisations"
  USING ("flame_rls_allows"("id")) WITH CHECK ("flame_rls_allows"("id"));

-- Tables with an organisationId column.
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "memberships"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

-- Platform Administrator invitations have no organisation: system scope only.
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "invitations"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

ALTER TABLE "facilities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "facilities"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "assets"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

ALTER TABLE "flare_sources" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "flare_sources"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

ALTER TABLE "activity_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "activity_records"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

ALTER TABLE "activity_record_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "activity_record_events"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

ALTER TABLE "gas_compositions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "gas_compositions"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

ALTER TABLE "flare_efficiencies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "flare_efficiencies"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

ALTER TABLE "calculations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "calculations"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

ALTER TABLE "calculation_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "calculation_events"
  USING ("flame_rls_allows"("organisationId")) WITH CHECK ("flame_rls_allows"("organisationId"));

-- Audit log (the app role may only INSERT and SELECT): an organisation reads its own
-- entries; entries without an organisation (sign-in and account events) may be written in
-- any scope but read only in system scope.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read" ON "audit_logs" FOR SELECT
  USING ("flame_rls_allows"("organisationId"));
CREATE POLICY "tenant_insert" ON "audit_logs" FOR INSERT
  WITH CHECK ("organisationId" IS NULL OR "flame_rls_allows"("organisationId"));

COMMIT;
