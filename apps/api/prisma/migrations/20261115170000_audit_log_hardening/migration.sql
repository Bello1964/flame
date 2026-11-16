-- Prisma does not run migrations in a transaction; wrap explicitly so this
-- migration applies completely or not at all (PostgreSQL DDL is transactional).
BEGIN;

-- ─── 1. Block TRUNCATE on the audit log ─────────────────────────────────────
-- Row triggers do not fire on TRUNCATE; this statement-level trigger closes that gap.
CREATE FUNCTION "audit_logs_prevent_truncate"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (TRUNCATE rejected)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_prevent_truncate"();

-- ─── 2. Least-privilege application role ────────────────────────────────────
-- Migrations run as the schema owner (MIGRATION_DATABASE_URL). The API runs as a
-- login that is a member of flame_app (DATABASE_URL). Because the app is not the
-- owner, it cannot disable or drop triggers, alter tables, or TRUNCATE.
-- Roles are cluster-wide, so create it only if it does not exist yet. On hosted
-- PostgreSQL without CREATEROLE, create flame_app beforehand (see docs).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flame_app') THEN
    CREATE ROLE flame_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO flame_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flame_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO flame_app;

-- Audit log: append and read only.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM flame_app;

-- Migration bookkeeping belongs to the owner only. The table is absent in Prisma's
-- temporary shadow database (used by `migrate dev`), hence the existence check.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM flame_app;
  END IF;
END
$$;

-- Tables and sequences created by later migrations (run by this same owner) get the
-- same CRUD grants automatically. Append-only tables must REVOKE explicitly, as above.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flame_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO flame_app;

COMMIT;
