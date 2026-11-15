import type pg from 'pg';
import type { Logger } from 'pino';
import type { PrismaClient } from '../generated/prisma/client.js';

/** The NOLOGIN group role created by the audit_log_hardening migration. */
export const APP_GROUP_ROLE = 'carbon_app';

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Creates (or updates the password of) a LOGIN role that is a member of carbon_app.
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

  const exists = await owner.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [username]);
  const role = owner.escapeIdentifier(username);
  const secret = owner.escapeLiteral(password);
  if (exists.rowCount === 0) {
    await owner.query(
      `CREATE ROLE ${role} LOGIN PASSWORD ${secret} IN ROLE ${owner.escapeIdentifier(APP_GROUP_ROLE)}`,
    );
    return 'created';
  }
  await owner.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${secret}`);
  await owner.query(`GRANT ${owner.escapeIdentifier(APP_GROUP_ROLE)} TO ${role}`);
  return 'updated';
}

export interface RolePrivileges {
  role: string;
  canUpdateAuditLog: boolean;
  canTruncateAuditLog: boolean;
  ownsAuditLog: boolean;
}

/** Reports what the API's own database connection is allowed to do to the audit log. */
export async function inspectAppRole(prisma: PrismaClient): Promise<RolePrivileges> {
  const rows = await prisma.$queryRaw<
    { role: string; can_update: boolean; can_truncate: boolean; owns: boolean }[]
  >`
    SELECT current_user AS role,
           has_table_privilege('public.audit_logs', 'UPDATE') AS can_update,
           has_table_privilege('public.audit_logs', 'TRUNCATE') AS can_truncate,
           pg_has_role(
             (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs'),
             'MEMBER'
           ) AS owns`;
  const row = rows[0];
  if (!row) throw new Error('Could not inspect the database role');
  return {
    role: row.role,
    canUpdateAuditLog: row.can_update,
    canTruncateAuditLog: row.can_truncate,
    ownsAuditLog: row.owns,
  };
}

/**
 * The API must not connect as the schema owner: the owner can disable the audit-log
 * triggers. In production this is fatal; in development it is a warning so local
 * setups keep working until the restricted login is configured.
 */
export async function assertRestrictedAppRole(
  prisma: PrismaClient,
  logger: Logger,
  isProduction: boolean,
): Promise<void> {
  const privileges = await inspectAppRole(prisma);
  const tooPowerful =
    privileges.ownsAuditLog || privileges.canUpdateAuditLog || privileges.canTruncateAuditLog;
  if (!tooPowerful) return;

  const message =
    `Database role "${privileges.role}" can modify or own audit_logs. ` +
    'Connect the API as a carbon_app login (see npm run db:create-app-user -w @carbon/api).';
  if (isProduction) throw new Error(message);
  logger.warn({ privileges }, message);
}
