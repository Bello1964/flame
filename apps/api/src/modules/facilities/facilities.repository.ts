import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../audit/audit.service.js';
import type { ListQuery } from './facilities.schemas.js';

/**
 * Tenant-scoped data access for the Facility → Asset → Flare Source hierarchy.
 * Every method takes organisationId and includes it in the WHERE clause.
 */

function statusFilter(status: ListQuery['status']): { status?: 'ACTIVE' | 'ARCHIVED' } {
  return status === 'ALL' ? {} : { status };
}

function searchFilter(q: string | undefined) {
  return q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { code: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};
}

function paging(query: ListQuery) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

const byName = [{ name: 'asc' as const }, { id: 'asc' as const }];

// ─── Facilities ──────────────────────────────────────────────────────────────

export async function listFacilities(db: Db, organisationId: string, query: ListQuery) {
  const where: Prisma.FacilityWhereInput = {
    organisationId,
    ...statusFilter(query.status),
    ...searchFilter(query.q),
  };
  const [items, total] = await Promise.all([
    db.facility.findMany({ where, orderBy: byName, ...paging(query) }),
    db.facility.count({ where }),
  ]);
  return { items, total };
}

export function findFacility(db: Db, organisationId: string, id: string) {
  return db.facility.findFirst({ where: { id, organisationId } });
}

// ─── Assets ──────────────────────────────────────────────────────────────────

export async function listAssets(
  db: Db,
  organisationId: string,
  query: ListQuery & { facilityId?: string | undefined },
) {
  const where: Prisma.AssetWhereInput = {
    organisationId,
    ...(query.facilityId ? { facilityId: query.facilityId } : {}),
    ...statusFilter(query.status),
    ...searchFilter(query.q),
  };
  const [items, total] = await Promise.all([
    db.asset.findMany({ where, orderBy: byName, ...paging(query) }),
    db.asset.count({ where }),
  ]);
  return { items, total };
}

export function findAsset(db: Db, organisationId: string, id: string) {
  return db.asset.findFirst({ where: { id, organisationId } });
}

export function countActiveAssets(db: Db, organisationId: string, facilityId: string) {
  return db.asset.count({ where: { organisationId, facilityId, status: 'ACTIVE' } });
}

// ─── Flare sources ───────────────────────────────────────────────────────────

export async function listFlareSources(
  db: Db,
  organisationId: string,
  query: ListQuery & { assetId?: string | undefined },
) {
  const where: Prisma.FlareSourceWhereInput = {
    organisationId,
    ...(query.assetId ? { assetId: query.assetId } : {}),
    ...statusFilter(query.status),
    ...searchFilter(query.q),
  };
  const [items, total] = await Promise.all([
    db.flareSource.findMany({ where, orderBy: byName, ...paging(query) }),
    db.flareSource.count({ where }),
  ]);
  return { items, total };
}

export function findFlareSource(db: Db, organisationId: string, id: string) {
  return db.flareSource.findFirst({ where: { id, organisationId } });
}

export function countActiveFlareSources(db: Db, organisationId: string, assetId: string) {
  return db.flareSource.count({ where: { organisationId, assetId, status: 'ACTIVE' } });
}

// ─── Row locks ───────────────────────────────────────────────────────────────
// Parameterised, tenant-scoped SELECT ... FOR UPDATE. Every update or archive takes the
// row lock before reading the record's status, so concurrent requests are serialised:
// an edit cannot land on a row archived in between, a record cannot be archived twice,
// and "create child" cannot interleave with "archive parent". Prisma has no
// query-builder equivalent.

export async function lockFacility(
  tx: Prisma.TransactionClient,
  organisationId: string,
  id: string,
) {
  await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${id}::uuid AND "organisationId" = ${organisationId}::uuid FOR UPDATE`;
}

export async function lockAsset(tx: Prisma.TransactionClient, organisationId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM assets WHERE id = ${id}::uuid AND "organisationId" = ${organisationId}::uuid FOR UPDATE`;
}

export async function lockFlareSource(
  tx: Prisma.TransactionClient,
  organisationId: string,
  id: string,
) {
  await tx.$queryRaw`SELECT id FROM flare_sources WHERE id = ${id}::uuid AND "organisationId" = ${organisationId}::uuid FOR UPDATE`;
}
