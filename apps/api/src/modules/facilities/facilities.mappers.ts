import type { AssetDto, FacilityDto, FlareSourceDto } from '@flame/shared';
import type { Asset, Facility, FlareSource } from '../../generated/prisma/client.js';

/** Explicit response shapes: only listed fields leave the API; decimals become exact strings. */

function base(r: Facility | Asset | FlareSource) {
  return {
    id: r.id,
    organisationId: r.organisationId,
    name: r.name,
    code: r.code,
    description: r.description,
    status: r.status,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdById: r.createdById,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toFacilityDto(f: Facility): FacilityDto {
  return {
    ...base(f),
    region: f.region,
    country: f.country,
    latitude: f.latitude?.toString() ?? null,
    longitude: f.longitude?.toString() ?? null,
    timeZone: f.timeZone,
  };
}

export function toAssetDto(a: Asset): AssetDto {
  return { ...base(a), facilityId: a.facilityId, assetType: a.assetType };
}

export function toFlareSourceDto(s: FlareSource): FlareSourceDto {
  return { ...base(s), assetId: s.assetId, flareType: s.flareType };
}
