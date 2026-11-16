import type {
  CalculationEventType,
  CalculationRoute,
  CalculationStatus,
  DataQuality,
  EfficiencyBasis,
  MethodologyEditionStatus,
  MethodologyParameterKind,
} from '@flame/shared';

export const ROUTE_LABELS: Record<CalculationRoute, string> = {
  COMPOSITION_FLARING: 'Flaring: measured gas composition',
  IPCC_REFERENCE_FLARING: 'Flaring: IPCC reference case',
  COMPOSITION_VENTING: 'Venting: measured gas composition',
};

export const ROUTE_HINTS: Record<CalculationRoute, string> = {
  COMPOSITION_FLARING:
    'CO₂ from the carbon in the gas analysis, unburned methane from the flare efficiency (API Compendium 2009, Equations 4-15 and 4-16), and N₂O from the IPCC factor.',
  IPCC_REFERENCE_FLARING:
    'IPCC factors per volume flared, for a reference gas of 91.9% methane at 98% efficiency. Only when no gas analysis is available; the result is labelled Estimated.',
  COMPOSITION_VENTING:
    'All methane and CO₂ in the vented gas is emitted; nothing is burned and no N₂O forms.',
};

export const CALCULATION_STATUS_LABELS: Record<CalculationStatus, string> = {
  CALCULATED: 'Calculated',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded',
  DISCARDED: 'Discarded',
};

export const CALCULATION_EVENT_LABELS: Record<CalculationEventType, string> = {
  CALCULATED: 'Calculated',
  SUBMITTED: 'Submitted for review',
  RECALLED: 'Recalled',
  REVIEW_STARTED: 'Started review',
  CLAIM_RELEASED: 'Released the review',
  FORWARDED: 'Forwarded for approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded by a newer approved version',
  DISCARDED: 'Discarded',
};

export const QUALITY_LABELS: Record<DataQuality, string> = {
  MEASURED_BASIS: 'Measured basis',
  ESTIMATED: 'Estimated',
};

export const EFFICIENCY_BASIS_LABELS: Record<EfficiencyBasis, string> = {
  MEASURED_TEST: 'Measured (flare test)',
  VENDOR_SPECIFICATION: 'Vendor specification',
  DESIGN_REQUIREMENT: 'Design requirement (not used in calculations)',
};

export const EDITION_STATUS_LABELS: Record<MethodologyEditionStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved: in use',
  SUPERSEDED: 'Superseded',
  WITHDRAWN: 'Withdrawn',
};

export const PARAMETER_KIND_LABELS: Record<MethodologyParameterKind, string> = {
  EMISSION_FACTOR: 'Emission factors',
  DEFAULT_ASSUMPTION: 'Default assumptions',
  GWP: 'Global warming potentials',
  CONSTANT: 'Constants',
  MOLECULAR_WEIGHT: 'Molecular weights',
  CARBON_NUMBER: 'Carbon atoms per molecule',
  UNIT_CONVERSION: 'Unit conversions',
};

/** Order in which parameter groups are shown. */
export const PARAMETER_KIND_ORDER: MethodologyParameterKind[] = [
  'EMISSION_FACTOR',
  'DEFAULT_ASSUMPTION',
  'GWP',
  'CONSTANT',
  'MOLECULAR_WEIGHT',
  'CARBON_NUMBER',
  'UNIT_CONVERSION',
];

/** Anchors on the methodology page, so a calculation step can link to the exact number. */
export const parameterAnchor = (key: string) => `param-${key.replace(/[^a-z0-9]+/gi, '-')}`;
export const decisionAnchor = (key: string) => `decision-${key}`;

export function methodologyLink(editionId: string, anchor?: string) {
  return `/methodology/editions/${editionId}${anchor ? `#${anchor}` : ''}`;
}
