import type pg from 'pg';
import type { Logger } from 'pino';
import type { PrismaClient } from '../generated/prisma/client.js';

/** The NOLOGIN group role created by the audit_log_hardening migration. */
export const APP_GROUP_ROLE = 'flame_app';

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

interface ExistingRole {
  rolsuper: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  owns_objects: boolean;
}

function privilegedReasons(r: ExistingRole): string[] {
  const reasons: string[] = [];
  if (r.rolsuper) reasons.push('is a superuser');
  if (r.rolcreaterole) reasons.push('can create roles');
  if (r.rolcreatedb) reasons.push('can create databases');
  if (r.rolreplication) reasons.push('has replication rights');
  if (r.rolbypassrls) reasons.push('bypasses row-level security');
  if (r.owns_objects) reasons.push('owns database objects');
  return reasons;
}

/**
 * Creates (or updates the password of) a LOGIN role that is a member of flame_app.
 * An existing role is only reused if it is a plain login that owns nothing.
 * Note: the password is sent inside the CREATE/ALTER ROLE statement, so it can appear
 * in server logs if PostgreSQL's log_statement is set to 'ddl' or 'all'.
 * Must be run with the schema owner's connection. Identifiers and the password are
 * escaped by the driver because CREATE ROLE does not accept bind parameters.
 */
export async function ensureAppLogin(
  owner: pg.Client,
  username: string,
  password: string,
): Promise<'created' | 'updated'> {
  if (!ROLE_NAME.test(username)) {
    throw new Error(`Invalid role name "${username}": use lower-case letters, digits, underscore.`);
  }
  if (password.length < 12) {
    throw new Error('The app database password must be at least 12 characters.');
  }

  const current = await owner.query<{ current_user: string }>('SELECT current_user');
  if (current.rows[0]?.current_user === username) {
    throw new Error(
      `Refusing to turn the owner role "${username}" into the app login. ` +
        'DATABASE_URL must use a different user from MIGRATION_DATABASE_URL.',
    );
  }

  const existing = await owner.query<ExistingRole>(
    `SELECT r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolbypassrls,
            EXISTS (SELECT 1 FROM pg_shdepend d WHERE d.refobjid = r.oid AND d.deptype = 'o')
              AS owns_objects
       FROM pg_roles r WHERE r.rolname = $1`,
    [username],
  );
  const role = owner.escapeIdentifier(username);
  const secret = owner.escapeLiteral(password);
  const found = existing.rows[0];
  if (!found) {
    await owner.query(
      `CREATE ROLE ${role} LOGIN PASSWORD ${secret} IN ROLE ${owner.escapeIdentifier(APP_GROUP_ROLE)}`,
    );
    return 'created';
  }

  // Only ever reuse a plain login. A mistyped DATABASE_URL naming e.g. "postgres" must
  // not have its password reset and be enrolled as the app login.
  const reasons = privilegedReasons(found);
  if (reasons.length > 0) {
    throw new Error(
      `Refusing to reuse existing role "${username}" as the app login: it ${reasons.join(', ')}. ` +
        'Choose a new user name in DATABASE_URL.',
    );
  }
  await owner.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${secret}`);
  await owner.query(`GRANT ${owner.escapeIdentifier(APP_GROUP_ROLE)} TO ${role}`);
  return 'updated';
}

export interface RolePrivileges {
  role: string;
  canUpdateAuditLog: boolean;
  canDeleteAuditLog: boolean;
  canTruncateAuditLog: boolean;
  ownsAuditLog: boolean;
  /** Superuser or BYPASSRLS: Row-Level Security would not apply to the API. */
  bypassesRls: boolean;
  /** Owns (or is a member of the owner of) a table with Row-Level Security enabled. */
  ownsRlsTable: boolean;
  /** Organisation tables that should have Row-Level Security enabled but do not. */
  tablesWithoutRls: string[];
}

/** The tables Row-Level Security must cover (ARCHITECTURAL_WORKFLOW.md §11). */
export const RLS_TABLES = [
  'activity_record_events',
  'activity_records',
  'assets',
  'audit_logs',
  'calculation_events',
  'calculations',
  'facilities',
  'flare_efficiencies',
  'flare_sources',
  'gas_compositions',
  'invitations',
  'memberships',
  'organisations',
] as const;

/**
 * Reports what the API's own database connection is allowed to do to the audit log, and
 * whether Row-Level Security applies to it.
 */
export async function inspectAppRole(prisma: PrismaClient): Promise<RolePrivileges> {
  const rows = await prisma.$queryRaw<
    {
      role: string;
      can_update: boolean;
      can_delete: boolean;
      can_truncate: boolean;
      owns: boolean;
      bypasses_rls: boolean;
      owns_rls_table: boolean;
      rls_tables: string[];
    }[]
  >`
    SELECT current_user AS role,
           has_table_privilege('public.audit_logs', 'UPDATE') AS can_update,
           has_table_privilege('public.audit_logs', 'DELETE') AS can_delete,
           has_table_privilege('public.audit_logs', 'TRUNCATE') AS can_truncate,
           pg_has_role(
             (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs'),
             'MEMBER'
           ) AS owns,
           (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user)
             AS bypasses_rls,
           EXISTS (
             SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relrowsecurity AND pg_has_role(c.relowner, 'MEMBER')
           ) AS owns_rls_table,
           ARRAY(
             SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
           ) AS rls_tables`;
  const row = rows[0];
  if (!row) throw new Error('Could not inspect the database role');
  return {
    role: row.role,
    canUpdateAuditLog: row.can_update,
    canDeleteAuditLog: row.can_delete,
    canTruncateAuditLog: row.can_truncate,
    ownsAuditLog: row.owns,
    bypassesRls: row.bypasses_rls,
    ownsRlsTable: row.owns_rls_table,
    tablesWithoutRls: RLS_TABLES.filter((t) => !row.rls_tables.includes(t)),
  };
}

/**
 * The API must not connect as the schema owner: the owner can disable the audit-log
 * triggers, and Row-Level Security does not apply to a table's owner or to a role with
 * BYPASSRLS. Every organisation table must also have Row-Level Security enabled. In
 * production any of these is fatal; in development it is a warning so local setups keep
 * working until the restricted login is configured.
 */
export async function assertRestrictedAppRole(
  prisma: PrismaClient,
  logger: Logger,
  isProduction: boolean,
): Promise<void> {
  const privileges = await inspectAppRole(prisma);
  const problems: string[] = [];
  if (
    privileges.ownsAuditLog ||
    privileges.canUpdateAuditLog ||
    privileges.canDeleteAuditLog ||
    privileges.canTruncateAuditLog
  ) {
    problems.push('can modify or own audit_logs');
  }
  if (privileges.bypassesRls) problems.push('bypasses Row-Level Security (superuser or BYPASSRLS)');
  if (privileges.ownsRlsTable) problems.push('owns a table protected by Row-Level Security');
  if (privileges.tablesWithoutRls.length > 0) {
    problems.push(`finds Row-Level Security off on ${privileges.tablesWithoutRls.join(', ')}`);
  }
  if (problems.length === 0) return;

  const message =
    `Database role "${privileges.role}" ${problems.join('; ')}. ` +
    'Apply all migrations and connect the API as a flame_app login (see npm run db:create-app-user -w @flame/api).';
  if (isProduction) throw new Error(message);
  logger.warn({ privileges }, message);
}
