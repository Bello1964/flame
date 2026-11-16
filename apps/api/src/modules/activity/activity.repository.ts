import type { ActivityRecordStatus, ActivityType, Prisma } from '../../generated/prisma/client.js';
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

/** Records that still count: everything except withdrawn, rejected and superseded. */
export const CURRENT_STATUSES: ActivityRecordStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_CORRECTION',
  'AWAITING_APPROVAL',
  'APPROVED',
];

/** Submitted or approved: these block an overlapping record from being submitted. */
export const COMMITTED_STATUSES: ActivityRecordStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_APPROVAL',
  'APPROVED',
];

/** A revision that is still being worked on (at most one per record). */
export const OPEN_REVISION_STATUSES: ActivityRecordStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_CORRECTION',
  'AWAITING_APPROVAL',
];

/** Related rows every response needs: where the record is, and who holds or approved it. */
export const recordInclude = {
  flareSource: {
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      asset: { select: { facility: { select: { name: true } } } },
    },
  },
  claimedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
} satisfies Prisma.ActivityRecordInclude;

export type RecordWithRelations = Prisma.ActivityRecordGetPayload<{
  include: typeof recordInclude;
}>;

export async function listRecords(
  db: Db,
  organisationId: string,
  query: ActivityListQuery,
  userId: string,
) {
  const where: Prisma.ActivityRecordWhereInput = {
    organisationId,
    ...(query.flareSourceId ? { flareSourceId: query.flareSourceId } : {}),
    ...(query.activityType ? { activityType: query.activityType } : {}),
    ...(query.status === 'ALL'
      ? {}
      : query.status === 'CURRENT'
        ? { status: { in: CURRENT_STATUSES } }
        : { status: query.status }),
    ...(query.claimedBy === 'me' ? { claimedById: userId } : {}),
    ...(query.from ? { periodEnd: { gte: dateOf(query.from) } } : {}),
    ...(query.to ? { periodStart: { lte: dateOf(query.to) } } : {}),
  };
  const orderBy: Prisma.ActivityRecordOrderByWithRelationInput[] =
    query.sort === 'submitted'
      ? [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
      : [{ periodStart: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }];
  const [items, total] = await Promise.all([
    db.activityRecord.findMany({
      where,
      include: recordInclude,
      orderBy,
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

export function findRecordWithRelations(db: Db, organisationId: string, id: string) {
  return db.activityRecord.findFirst({ where: { id, organisationId }, include: recordInclude });
}

/**
 * Records of the same flare source and activity type, in the given statuses, whose
 * inclusive date range intersects [periodStart, periodEnd]. `excludeIds` leaves out the
 * record itself and the record it revises (a revision replaces it, so they don't clash).
 */
export function findOverlapping(
  db: Db,
  organisationId: string,
  flareSourceId: string,
  activityType: ActivityType,
  periodStart: Date,
  periodEnd: Date,
  statuses: ActivityRecordStatus[],
  excludeIds: (string | null | undefined)[] = [],
) {
  const exclude = excludeIds.filter((id): id is string => typeof id === 'string');
  return db.activityRecord.findMany({
    where: {
      organisationId,
      flareSourceId,
      activityType,
      status: { in: statuses },
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart },
      ...(exclude.length > 0 ? { id: { notIn: exclude } } : {}),
    },
    select: { id: true, periodStart: true, periodEnd: true, status: true },
    orderBy: [{ periodStart: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Current records that could overlap any of `records` (same flare sources, date range
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
      status: { in: CURRENT_STATUSES },
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
      revisionOfId: true,
    },
  });
}

export interface Involvement {
  /** Created, edited or submitted the record. */
  involved: Set<string>;
  /** Started a review of the record. */
  reviewers: Set<string>;
}

/**
 * Who has been involved with each record and who has reviewed it, read from the
 * append-only history. Separation of duties (§7.1) is decided from this. The stored
 * creator always counts too, so a record whose history is incomplete (e.g. written by an
 * older API version during a deploy) never loses its creator's involvement.
 */
export async function involvementOf(
  db: Db,
  organisationId: string,
  records: { id: string; createdById: string }[],
): Promise<Map<string, Involvement>> {
  const result = new Map<string, Involvement>();
  for (const r of records) {
    result.set(r.id, { involved: new Set([r.createdById]), reviewers: new Set() });
  }
  const recordIds = records.map((r) => r.id);
  if (recordIds.length === 0) return result;
  const events = await db.activityRecordEvent.findMany({
    where: {
      organisationId,
      activityRecordId: { in: recordIds },
      type: { in: ['CREATED', 'EDITED', 'SUBMITTED', 'REVIEW_STARTED'] },
    },
    select: { activityRecordId: true, type: true, actorId: true },
  });
  for (const e of events) {
    const entry = result.get(e.activityRecordId);
    if (!entry) continue;
    if (e.type === 'REVIEW_STARTED') entry.reviewers.add(e.actorId);
    else entry.involved.add(e.actorId);
  }
  return result;
}

/** Revisions of the given records that are still open, or that replaced them. */
export function revisionsOf(db: Db, organisationId: string, recordIds: string[]) {
  if (recordIds.length === 0) return Promise.resolve([]);
  return db.activityRecord.findMany({
    where: {
      organisationId,
      revisionOfId: { in: recordIds },
      status: { in: [...OPEN_REVISION_STATUSES, 'APPROVED', 'SUPERSEDED'] },
    },
    select: { id: true, revisionOfId: true, status: true },
  });
}

export function listEvents(db: Db, organisationId: string, recordId: string) {
  return db.activityRecordEvent.findMany({
    where: { organisationId, activityRecordId: recordId },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

export interface NewEvent {
  organisationId: string;
  activityRecordId: string;
  type: Prisma.ActivityRecordEventCreateManyInput['type'];
  fromStatus: ActivityRecordStatus | null;
  toStatus: ActivityRecordStatus;
  actorId: string;
  comment?: string | null;
  details?: Prisma.InputJsonValue;
}

/** Appends to a record's history. Pass the transaction client so it commits with the change. */
export async function addEvent(db: Db, event: NewEvent): Promise<void> {
  await db.activityRecordEvent.create({
    data: {
      organisationId: event.organisationId,
      activityRecordId: event.activityRecordId,
      type: event.type,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actorId: event.actorId,
      comment: event.comment ?? null,
      ...(event.details === undefined ? {} : { details: event.details }),
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
