import type { FlareService } from './calculations.js';
export type RecordStatus = 'ACTIVE' | 'ARCHIVED';

export const FLARE_TYPES = ['ELEVATED', 'GROUND', 'ENCLOSED', 'OTHER'] as const;
export type FlareType = (typeof FLARE_TYPES)[number];

interface HierarchyRecord {
  id: string;
  organisationId: string;
  name: string;
  code: string;
  description: string | null;
  status: RecordStatus;
  archivedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface FacilityDto extends HierarchyRecord {
  region: string | null;
  country: string;
  /** Decimal degrees as strings to preserve exact precision. */
  latitude: string | null;
  longitude: string | null;
  /** IANA time zone that defines activity days and periods, e.g. "Africa/Lagos". */
  timeZone: string;
}

export interface AssetDto extends HierarchyRecord {
  facilityId: string;
  assetType: string | null;
}

export interface FlareSourceDto extends HierarchyRecord {
  assetId: string;
  flareType: FlareType | null;
  /** Production or refinery service; decides which methodology defaults may apply. */
  flareService: FlareService | null;
}
