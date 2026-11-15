import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import { conflict, notFound } from '../../lib/errors.js';
import { definedOnly } from '../../lib/objects.js';
import { recordAudit } from '../audit/audit.service.js';
import { changeSet, onlyChanged, withStoredValues } from '../audit/change-set.js';
import * as repo from './facilities.repository.js';
import type {
  AssetCreate,
  AssetListQuery,
  AssetUpdate,
  FacilityCreate,
  FacilityUpdate,
  FlareSourceCreate,
  FlareSourceListQuery,
  FlareSourceUpdate,
  ListQuery,
} from './facilities.schemas.js';

/** Who is acting, in which organisation. Built from the verified membership, never from the body. */
export interface Actor {
  organisationId: string;
  userId: string;
  ipAddress: string | null;
}

/**
 * Business rules for the operational hierarchy:
 * - Every read and write is scoped to the actor's organisation.
 * - Records are archived, never deleted. Archived records are read-only.
 * - A parent cannot be archived while it has active children, and a child
 *   cannot be created under an archived parent (row locks prevent races).
 * - Each change writes an audit entry in the same transaction. Edits record each
 *   changed field as { before, after }; an edit that changes nothing writes nothing.
 */
export class FacilitiesService {
  constructor(private readonly prisma: PrismaClient) {}

  // ─── Facilities ────────────────────────────────────────────────────────────

  listFacilities(organisationId: string, query: ListQuery) {
    return repo.listFacilities(this.prisma, organisationId, query);
  }

  async getFacility(organisationId: string, id: string) {
    const facility = await repo.findFacility(this.prisma, organisationId, id);
    if (!facility) throw notFound('Facility not found');
    return facility;
  }

  createFacility(actor: Actor, input: FacilityCreate) {
    return this.prisma.$transaction(async (tx) => {
      const facility = await tx.facility.create({
        data: {
          ...definedOnly(input),
          organisationId: actor.organisationId,
          createdById: actor.userId,
        },
      });
      await this.audit(tx, actor, 'facility.created', 'Facility', facility.id, { input });
      return facility;
    });
  }

  updateFacility(actor: Actor, id: string, input: FacilityUpdate) {
    return this.prisma.$transaction(async (tx) => {
      await repo.lockFacility(tx, actor.organisationId, id);
      const existing = this.activeOrThrow(
        await repo.findFacility(tx, actor.organisationId, id),
        'Facility',
      );
      const changes = changeSet(existing, input);
      if (Object.keys(changes).length === 0) return existing;
      const updated = await tx.facility.update({
        where: { id: existing.id },
        data: definedOnly(onlyChanged(input, changes)),
      });
      await this.audit(tx, actor, 'facility.updated', 'Facility', id, {
        changes: withStoredValues(changes, updated),
      });
      return updated;
    });
  }

  archiveFacility(actor: Actor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await repo.lockFacility(tx, actor.organisationId, id);
      this.activeOrThrow(await repo.findFacility(tx, actor.organisationId, id), 'Facility');
      const activeAssets = await repo.countActiveAssets(tx, actor.organisationId, id);
      if (activeAssets > 0) {
        throw conflict('Archive the facility’s active assets first', { activeAssets });
      }
      const archived = await tx.facility.update({
        where: { id },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
      await this.audit(tx, actor, 'facility.archived', 'Facility', id);
      return archived;
    });
  }

  // ─── Assets ────────────────────────────────────────────────────────────────

  listAssets(organisationId: string, query: AssetListQuery) {
    return repo.listAssets(this.prisma, organisationId, query);
  }

  async getAsset(organisationId: string, id: string) {
    const asset = await repo.findAsset(this.prisma, organisationId, id);
    if (!asset) throw notFound('Asset not found');
    return asset;
  }

  createAsset(actor: Actor, input: AssetCreate) {
    return this.prisma.$transaction(async (tx) => {
      await repo.lockFacility(tx, actor.organisationId, input.facilityId);
      const facility = await repo.findFacility(tx, actor.organisationId, input.facilityId);
      // Another organisation's facility is indistinguishable from a missing one.
      if (!facility) throw notFound('Facility not found');
      if (facility.status !== 'ACTIVE')
        throw conflict('Cannot add an asset to an archived facility');

      const asset = await tx.asset.create({
        data: {
          ...definedOnly(input),
          organisationId: actor.organisationId,
          createdById: actor.userId,
        },
      });
      await this.audit(tx, actor, 'asset.created', 'Asset', asset.id, { input });
      return asset;
    });
  }

  updateAsset(actor: Actor, id: string, input: AssetUpdate) {
    return this.prisma.$transaction(async (tx) => {
      await repo.lockAsset(tx, actor.organisationId, id);
      const existing = this.activeOrThrow(
        await repo.findAsset(tx, actor.organisationId, id),
        'Asset',
      );
      const changes = changeSet(existing, input);
      if (Object.keys(changes).length === 0) return existing;
      const updated = await tx.asset.update({
        where: { id },
        data: definedOnly(onlyChanged(input, changes)),
      });
      await this.audit(tx, actor, 'asset.updated', 'Asset', id, {
        changes: withStoredValues(changes, updated),
      });
      return updated;
    });
  }

  archiveAsset(actor: Actor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await repo.lockAsset(tx, actor.organisationId, id);
      this.activeOrThrow(await repo.findAsset(tx, actor.organisationId, id), 'Asset');
      const activeSources = await repo.countActiveFlareSources(tx, actor.organisationId, id);
      if (activeSources > 0) {
        throw conflict('Archive the asset’s active flare sources first', {
          activeFlareSources: activeSources,
        });
      }
      const archived = await tx.asset.update({
        where: { id },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
      await this.audit(tx, actor, 'asset.archived', 'Asset', id);
      return archived;
    });
  }

  // ─── Flare sources ─────────────────────────────────────────────────────────

  listFlareSources(organisationId: string, query: FlareSourceListQuery) {
    return repo.listFlareSources(this.prisma, organisationId, query);
  }

  async getFlareSource(organisationId: string, id: string) {
    const source = await repo.findFlareSource(this.prisma, organisationId, id);
    if (!source) throw notFound('Flare source not found');
    return source;
  }

  createFlareSource(actor: Actor, input: FlareSourceCreate) {
    return this.prisma.$transaction(async (tx) => {
      await repo.lockAsset(tx, actor.organisationId, input.assetId);
      const asset = await repo.findAsset(tx, actor.organisationId, input.assetId);
      if (!asset) throw notFound('Asset not found');
      if (asset.status !== 'ACTIVE') {
        throw conflict('Cannot add a flare source to an archived asset');
      }

      const source = await tx.flareSource.create({
        data: {
          ...definedOnly(input),
          organisationId: actor.organisationId,
          createdById: actor.userId,
        },
      });
      await this.audit(tx, actor, 'flare_source.created', 'FlareSource', source.id, { input });
      return source;
    });
  }

  updateFlareSource(actor: Actor, id: string, input: FlareSourceUpdate) {
    return this.prisma.$transaction(async (tx) => {
      await repo.lockFlareSource(tx, actor.organisationId, id);
      const existing = this.activeOrThrow(
        await repo.findFlareSource(tx, actor.organisationId, id),
        'Flare source',
      );
      const changes = changeSet(existing, input);
      if (Object.keys(changes).length === 0) return existing;
      const updated = await tx.flareSource.update({
        where: { id },
        data: definedOnly(onlyChanged(input, changes)),
      });
      await this.audit(tx, actor, 'flare_source.updated', 'FlareSource', id, {
        changes: withStoredValues(changes, updated),
      });
      return updated;
    });
  }

  archiveFlareSource(actor: Actor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await repo.lockFlareSource(tx, actor.organisationId, id);
      this.activeOrThrow(await repo.findFlareSource(tx, actor.organisationId, id), 'Flare source');
      const archived = await tx.flareSource.update({
        where: { id },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
      await this.audit(tx, actor, 'flare_source.archived', 'FlareSource', id);
      return archived;
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private activeOrThrow<T extends { status: 'ACTIVE' | 'ARCHIVED' }>(
    record: T | null,
    label: string,
  ): T {
    if (!record) throw notFound(`${label} not found`);
    if (record.status !== 'ACTIVE') throw conflict(`${label} is archived and cannot be changed`);
    return record;
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return recordAudit(tx, {
      organisationId: actor.organisationId,
      actorUserId: actor.userId,
      action,
      entityType,
      entityId,
      ...(metadata === undefined ? {} : { metadata }),
      ipAddress: actor.ipAddress,
    });
  }
}
