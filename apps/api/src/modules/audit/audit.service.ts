import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

/** A Prisma client or an interactive transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  organisationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Change summary. Never include passwords, tokens or secrets. */
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

/**
 * Appends an audit record. Pass the transaction client so the entry commits with the change.
 * Written without reading the row back: entries without an organisation may be written in
 * any database scope but read only in system scope (Row-Level Security, §11).
 */
export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.createMany({
    data: {
      organisationId: entry.organisationId ?? null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
      ipAddress: entry.ipAddress ?? null,
    },
  });
}
