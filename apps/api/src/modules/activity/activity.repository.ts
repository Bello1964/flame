import type { ActivityType, Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../audit/audit.service.js';
import type { ActivityListQuery } from './activity.schemas.js';

/**
 * Tenant-scoped data access for activity records. Every method takes organisationId
 * and includes it in the WHERE clause.
 */

/** A local calendar date (YYYY-MM-DD) as the UTC-midnight Date that Prisma maps to DATE. */
export function dateOf(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/** The DATE column value back as YYYY-MM-DD. */
export function isoDateOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function listRecords(db: Db, organisationId: string, query: ActivityListQuery) {
  const where: Prisma.ActivityRecordWhereInput = {
    organisationId,
    ...(query.flareSourceId ? { flareSourceId: query.flareSourceId } : {}),
    ...(query.activityType ? { activityType: query.activityType } : {}),
    ...(query.status === 'ALL' ? {} : { status: query.status }),
    ...(query.from ? { periodEnd: { gte: dateOf(query.from) } } : {}),
    ...(query.to ? { periodStart: { lte: dateOf(query.to) } } : {}),
  };
  const [items, total] = await Promise.all([
    db.activityRecord.findMany({
      where,
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.activityRecord.count({ where }),
  ]);
  return { items, total };
}

export function findRecord(db: Db, organisationId: string, id: string) {
  return db.activityRecord.findFirst({ where: { id, organisationId } });
}

/**
 * Draft records of the same flare source and activity type whose inclusive date range
 * intersects [periodStart, periodEnd]. Withdrawn records never count.
 */
export function findOverlapping(
  db: Db,
  organisationId: string,
  flareSourceId: string,
  activityType: ActivityType,
  periodStart: Date,
  periodEnd: Date,
  excludeId?: string,
) {
  return db.activityRecord.findMany({
    where: {
      organisationId,
      flareSourceId,
      activityType,
      status: 'DRAFT',
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, periodStart: true, periodEnd: true },
    orderBy: [{ periodStart: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Draft records that could overlap any of `records` (same flare sources, date range
 * spanning them all). The caller pairs them up in memory; one query per page.
 */
export function overlapCandidates(
  db: Db,
  organisationId: string,
  records: { flareSourceId: string; periodStart: Date; periodEnd: Date }[],
) {
  if (records.length === 0) return Promise.resolve([]);
  const starts = records.map((r) => r.periodStart.getTime());
  const ends = records.map((r) => r.periodEnd.getTime());
  return db.activityRecord.findMany({
    where: {
      organisationId,
      status: 'DRAFT',
      flareSourceId: { in: [...new Set(records.map((r) => r.flareSourceId))] },
      periodStart: { lte: new Date(Math.max(...ends)) },
      periodEnd: { gte: new Date(Math.min(...starts)) },
    },
    select: {
      id: true,
      flareSourceId: true,
      activityType: true,
      periodStart: true,
      periodEnd: true,
    },
  });
}

/** The flare source with the facility time zone that defines its activity days. */
export function findFlareSourceForActivity(db: Db, organisationId: string, id: string) {
  return db.flareSource.findFirst({
    where: { id, organisationId },
    select: {
      id: true,
      status: true,
      asset: { select: { facility: { select: { timeZone: true } } } },
    },
  });
}

/** Row lock on one record (tenant-scoped); see facilities.repository.ts for the rationale. */
export async function lockRecord(tx: Prisma.TransactionClient, organisationId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM activity_records WHERE id = ${id}::uuid AND "organisationId" = ${organisationId}::uuid FOR UPDATE`;
}
