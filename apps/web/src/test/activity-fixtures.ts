import type { ActivityRecordDto, FlareSourceDto } from '@flame/shared';
import { ORG_A } from './render-app';

/** Sample records for interface tests only: not real operational data. */

export const SOURCE_ID = 'c0000000-0000-4000-8000-000000000001';
export const RECORD_ID = 'd0000000-0000-4000-8000-000000000001';

export const source: FlareSourceDto = {
  id: SOURCE_ID,
  organisationId: ORG_A,
  assetId: 'a0000000-0000-4000-8000-000000000001',
  name: 'HP Flare Stack',
  code: 'HP-1',
  description: null,
  flareType: 'ELEVATED',
  flareService: null,
  status: 'ACTIVE',
  archivedAt: null,
  createdById: 'user-1',
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
};

export function record(overrides: Partial<ActivityRecordDto> = {}): ActivityRecordDto {
  return {
    id: RECORD_ID,
    organisationId: ORG_A,
    flareSourceId: SOURCE_ID,
    kind: 'DAILY',
    activityType: 'ROUTINE_FLARING',
    otherTypeDescription: null,
    periodStart: '2026-01-10',
    periodEnd: '2026-01-10',
    timeZone: 'Africa/Lagos',
    averageRate: { value: '0.25', unit: 'MMSCF_PER_DAY', entered: '0.250' },
    totalVolume: null,
    operatingHours: { value: '12', entered: '12' },
    referenceTemperature: { value: '15', unit: 'CELSIUS', entered: '15' },
    referencePressure: { value: '101.325', unit: 'KPA_ABS', entered: '101.325' },
    zSource: null,
    zReference: null,
    compressibilitySource: null,
    measurementBasis: 'MEASURED',
    estimateExplanation: null,
    measurementMethod: 'METERED',
    methodDescription: null,
    dataSource: 'MANUAL',
    notes: null,
    standardised: {
      referenceCondition: 'ISO 13443 (15 °C, 101.325 kPa)',
      averageRateMmscfd: '0.25',
      totalVolumeMmscf: null,
      derivedVolumeMmscf: '0.125',
      correctionFactor: '1',
      conversionVersion: 'iso13443-real-gas-v1',
      standardisedAt: '2026-11-15T10:00:00.000Z',
    },
    status: 'DRAFT',
    version: 1,
    revisionOfId: null,
    openRevisionId: null,
    supersededById: null,
    flareSource: { id: SOURCE_ID, name: 'HP Flare Stack', code: 'HP-1', facilityName: 'Bonny' },
    submittedAt: null,
    claim: null,
    approval: null,
    supersededAt: null,
    withdrawal: null,
    availableActions: ['edit', 'withdraw', 'submit'],
    separationOfDuties: null,
    overlapAcknowledgedAt: null,
    warnings: [{ code: 'NO_EVIDENCE', message: 'No supporting evidence is attached' }],
    createdById: 'user-1',
    updatedById: 'user-1',
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  };
}
