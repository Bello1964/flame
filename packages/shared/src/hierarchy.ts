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

/** Facility types listed in NUPRC's GHG inventory template (Appendices A and C). */
export const NUPRC_FACILITY_TYPES = [
  'CPF',
  'FLOWSTATION',
  'WELLPAD',
  'PLATFORM',
  'FSO',
  'FPSO',
] as const;
export type NuprcFacilityType = (typeof NUPRC_FACILITY_TYPES)[number];
export const NUPRC_FACILITY_TYPE_LABELS: Record<NuprcFacilityType, string> = {
  CPF: 'CPF',
  FLOWSTATION: 'Flowstation',
  WELLPAD: 'Wellpad',
  PLATFORM: 'Platform',
  FSO: 'FSO',
  FPSO: 'FPSO',
};
export const FACILITY_TERRAINS = ['ONSHORE', 'OFFSHORE'] as const;
export type FacilityTerrain = (typeof FACILITY_TERRAINS)[number];
export const FACILITY_SEGMENTS = ['OIL', 'GAS', 'OIL_AND_GAS'] as const;
export type FacilitySegment = (typeof FACILITY_SEGMENTS)[number];
export const FACILITY_SEGMENT_LABELS: Record<FacilitySegment, string> = {
  OIL: 'Oil',
  GAS: 'Gas',
  OIL_AND_GAS: 'Oil & Gas',
};

export interface FacilityDto extends HierarchyRecord {
  /** Onshore or offshore (NUPRC "Location (Terrain)"). Optional; reports flag it when missing. */
  terrain: FacilityTerrain | null;
  /** Licence or lease, e.g. "OML 58" (NUPRC "Concession"). */
  concession: string | null;
  /** Oil or gas field the facility serves (NUPRC "Field Name"). */
  fieldName: string | null;
  /** NUPRC facility type. */
  facilityType: NuprcFacilityType | null;
  /** Oil, gas or both (NUPRC "Segment"). */
  segment: FacilitySegment | null;
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
