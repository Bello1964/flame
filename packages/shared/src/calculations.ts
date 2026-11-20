/**
 * Emissions calculations and the methodology registry (Milestone 3).
 * Rules: docs/architecture/ARCHITECTURAL_WORKFLOW.md §8.1.
 */

/** Production or refinery service: decides which methodology defaults may apply. */
export const FLARE_SERVICES = ['PRODUCTION', 'REFINERY'] as const;
export type FlareService = (typeof FLARE_SERVICES)[number];

// ─── Methodology registry ─────────────────────────────────────────────────────

export const METHODOLOGY_EDITION_STATUSES = [
  'DRAFT',
  'APPROVED',
  'SUPERSEDED',
  'WITHDRAWN',
] as const;
export type MethodologyEditionStatus = (typeof METHODOLOGY_EDITION_STATUSES)[number];

export const METHODOLOGY_PARAMETER_KINDS = [
  'UNIT_CONVERSION',
  'CONSTANT',
  'MOLECULAR_WEIGHT',
  'CARBON_NUMBER',
  'EMISSION_FACTOR',
  'DEFAULT_ASSUMPTION',
  'GWP',
] as const;
export type MethodologyParameterKind = (typeof METHODOLOGY_PARAMETER_KINDS)[number];

export interface MethodologyReference {
  label: string;
  /** Page, table, footnote, equation or section. */
  location: string;
  url?: string;
}

export interface MethodologyStep {
  /** Matches CalculationStepDto.key. */
  key: string;
  title: string;
  formula: string;
  explanation: string;
  /** Parameter keys this step uses. */
  parameters: string[];
}

/**
 * How a route is classified for regulatory reporting (e.g. "IPCC Tier 2"), with its source.
 * Set by Platform Administrators in a methodology edition; Flame never assigns it.
 */
export interface MethodologyReportingTier {
  label: string;
  reference: MethodologyReference;
}

export interface MethodologyRoute {
  key: CalculationRoute;
  /** Shown in NUPRC "FRAMEWORK ADOPTED"; absent until an edition sets it. */
  reportingTier?: MethodologyReportingTier;
  title: string;
  appliesTo: string;
  requires: string[];
  steps: MethodologyStep[];
}

export interface MethodologyDecision {
  key: string;
  title: string;
  decision: string;
  reason: string;
  references: MethodologyReference[];
}

export interface MethodologyContent {
  overview: string[];
  routes: MethodologyRoute[];
  decisions: MethodologyDecision[];
  limitations: string[];
}

export interface MethodologyParameterDto {
  key: string;
  kind: MethodologyParameterKind;
  name: string;
  /** Exact decimal string. */
  value: string;
  unit: string;
  gas: string | null;
  appliesTo: string;
  sourceOrganisation: string;
  sourceDocument: string;
  sourceEdition: string;
  sourceLocation: string;
  sourceUrl: string | null;
  /** YYYY-MM-DD */
  retrievedOn: string;
  notes: string | null;
}

export interface MethodologyEditionSummaryDto {
  id: string;
  code: string;
  edition: number;
  title: string;
  summary: string;
  status: MethodologyEditionStatus;
  approvedAt: string | null;
  supersededAt: string | null;
}

export interface MethodologyEditionDto extends MethodologyEditionSummaryDto {
  content: MethodologyContent;
  parameters: MethodologyParameterDto[];
  /** Who supplied the values when no user created the edition. */
  provenance: string | null;
  createdBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  createdAt: string;
  withdrawal: { at: string; reason: string } | null;
  /** Platform Administrators only: whether the requesting admin may approve this draft. */
  canApprove?: boolean;
  /** Why the requesting admin may not approve it (e.g. they created it). */
  approvalBlockedReason?: string | null;
}

/** PATCH /admin/methodology/editions/:id (draft only). */
export interface MethodologyEditionUpdate {
  title?: string;
  summary?: string;
  content?: MethodologyContent;
}

/** PATCH /admin/methodology/editions/:id/parameters/:key (draft only). */
export type MethodologyParameterUpdate = Partial<
  Omit<MethodologyParameterDto, 'key' | 'kind' | 'gas'>
>;

// ─── Calculation inputs ───────────────────────────────────────────────────────

export const INPUT_RECORD_STATUSES = ['ACTIVE', 'WITHDRAWN'] as const;
export type InputRecordStatus = (typeof INPUT_RECORD_STATUSES)[number];

/** Gas components in mole percent, in the order they are entered and shown. */
export const GAS_COMPONENTS = [
  'methane',
  'ethane',
  'propane',
  'isoButane',
  'normalButane',
  'isoPentane',
  'normalPentane',
  'hexanesPlus',
  'carbonDioxide',
  'nitrogen',
  'hydrogenSulphide',
  'otherInerts',
] as const;
export type GasComponent = (typeof GAS_COMPONENTS)[number];

export const GAS_COMPONENT_LABELS: Record<GasComponent, string> = {
  methane: 'Methane (CH₄)',
  ethane: 'Ethane (C₂H₆)',
  propane: 'Propane (C₃H₈)',
  isoButane: 'iso-Butane (i-C₄H₁₀)',
  normalButane: 'n-Butane (n-C₄H₁₀)',
  isoPentane: 'iso-Pentane (i-C₅H₁₂)',
  normalPentane: 'n-Pentane (n-C₅H₁₂)',
  hexanesPlus: 'Hexanes and heavier (C₆+)',
  carbonDioxide: 'Carbon dioxide (CO₂)',
  nitrogen: 'Nitrogen (N₂)',
  hydrogenSulphide: 'Hydrogen sulphide (H₂S)',
  otherInerts: 'Other inerts',
};

/** A gas analysis must total 100% within this tolerance, as entered (never normalised). */
export const COMPOSITION_TOTAL_TOLERANCE = '0.5';

export interface GasCompositionCreate {
  /** YYYY-MM-DD: used for activity whose period starts on or after this date. */
  validFrom: string;
  sampleDate: string;
  sampleReference: string;
  analysisMethod?: string | null;
  /** Mole percent per component, as decimal strings (up to 6 decimal places). */
  components: Record<GasComponent, string>;
  /** Required when C₆+ is above zero. */
  hexanesPlusCarbonNumber?: string | null;
  notes?: string | null;
}

export interface GasCompositionDto {
  id: string;
  flareSourceId: string;
  validFrom: string;
  sampleDate: string;
  sampleReference: string;
  analysisMethod: string | null;
  components: Record<GasComponent, string>;
  hexanesPlusCarbonNumber: string | null;
  /** Sum of components, exact. */
  total: string;
  notes: string | null;
  status: InputRecordStatus;
  withdrawal: { at: string; byId: string; reason: string } | null;
  /** Calculations have used it (it is still never edited; corrections are new analyses). */
  usedByCalculations: boolean;
  createdBy: { id: string; name: string };
  createdAt: string;
}

export const EFFICIENCY_BASES = [
  'MEASURED_TEST',
  'VENDOR_SPECIFICATION',
  'DESIGN_REQUIREMENT',
] as const;
export type EfficiencyBasis = (typeof EFFICIENCY_BASES)[number];

export interface FlareEfficiencyCreate {
  validFrom: string;
  basis: EfficiencyBasis;
  /** Percent of hydrocarbon carbon converted to CO₂ (the design DRE for a requirement). */
  combustionEfficiencyPercent: string;
  /** Percent of methane leaving uncombusted; required for test and vendor values. */
  uncombustedMethanePercent?: string | null;
  sourceReference: string;
  testDate?: string | null;
  notes?: string | null;
}

export interface FlareEfficiencyDto {
  id: string;
  flareSourceId: string;
  validFrom: string;
  basis: EfficiencyBasis;
  combustionEfficiencyPercent: string;
  uncombustedMethanePercent: string | null;
  sourceReference: string;
  testDate: string | null;
  notes: string | null;
  status: InputRecordStatus;
  withdrawal: { at: string; byId: string; reason: string } | null;
  usedByCalculations: boolean;
  createdBy: { id: string; name: string };
  createdAt: string;
}

// ─── Calculations ─────────────────────────────────────────────────────────────

export const CALCULATION_ROUTES = [
  'COMPOSITION_FLARING',
  'IPCC_REFERENCE_FLARING',
  'COMPOSITION_VENTING',
] as const;
export type CalculationRoute = (typeof CALCULATION_ROUTES)[number];

export const EFFICIENCY_SOURCES = ['FLARE_RECORD', 'METHODOLOGY_DEFAULT'] as const;
export type EfficiencySource = (typeof EFFICIENCY_SOURCES)[number];

export const CALCULATION_STATUSES = [
  'CALCULATED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
  'DISCARDED',
] as const;
export type CalculationStatus = (typeof CALCULATION_STATUSES)[number];

export const DATA_QUALITIES = ['MEASURED_BASIS', 'ESTIMATED'] as const;
export type DataQuality = (typeof DATA_QUALITIES)[number];

export const CALCULATION_ACTIONS = [
  'submit',
  'recall',
  'discard',
  'start-review',
  'release-claim',
  'forward',
  'approve',
  'reject',
] as const;
export type CalculationAction = (typeof CALCULATION_ACTIONS)[number];

/** Actions that require a comment (kept in the calculation history). */
export const CALCULATION_COMMENT_REQUIRED: readonly CalculationAction[] = [
  'discard',
  'release-claim',
  'reject',
];

/** POST /activity-records/:id/calculations */
export interface CalculationRunRequest {
  route: CalculationRoute;
  /** Composition flaring only. */
  efficiencySource?: EfficiencySource;
  /** Required for the IPCC reference-case route. */
  fallbackReason?: string;
  notes?: string;
}

/** One value used in a step, with where it came from. */
export interface CalculationValueDto {
  symbol: string;
  label: string;
  value: string;
  unit: string;
  /** Methodology parameter key, when the value comes from the edition. */
  parameterKey?: string;
  /** Otherwise where it came from (activity record, gas analysis, flare efficiency). */
  origin?: string;
}

export interface CalculationStepDto {
  key: string;
  title: string;
  formula: string;
  /** The formula with the actual numbers. */
  substituted: string;
  values: CalculationValueDto[];
  result: { symbol: string; value: string; unit: string };
}

export interface CalculationResultDto {
  co2Tonnes: string;
  ch4Tonnes: string;
  /** Null where N₂O doesn't apply (venting). */
  n2oTonnes: string | null;
  co2eTonnes: string;
  gwp: { co2: string; ch4: string; n2o: string | null; source: string };
}

export interface CalculationDto {
  id: string;
  organisationId: string;
  activityRecordId: string;
  version: number;
  route: CalculationRoute;
  edition: {
    id: string;
    code: string;
    edition: number;
    title: string;
    status: MethodologyEditionStatus;
  };
  efficiencySource: EfficiencySource | null;
  flareEfficiencyId: string | null;
  gasCompositionId: string | null;
  fallbackReason: string | null;
  notes: string | null;
  activity: {
    id: string;
    kind: 'DAILY' | 'PERIOD';
    activityType: string;
    periodStart: string;
    periodEnd: string;
    status: string;
  };
  flareSource: { id: string; name: string; code: string; facilityName: string };
  volumeM3: string;
  results: CalculationResultDto;
  steps: CalculationStepDto[];
  /** Snapshot of every input as used (activity values, analysis, efficiency). */
  inputs: Record<string, unknown>;
  engineVersion: string;
  dataQuality: DataQuality;
  qualityReasons: string[];
  status: CalculationStatus;
  /** The activity record was revised after this calculation: recalculation needed. */
  activityRevised: boolean;
  submittedAt: string | null;
  claim: { byId: string; byName: string; at: string } | null;
  approval: { at: string; byId: string; byName: string } | null;
  supersededAt: string | null;
  availableActions: CalculationAction[];
  separationOfDuties: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export const CALCULATION_EVENT_TYPES = [
  'CALCULATED',
  'SUBMITTED',
  'RECALLED',
  'REVIEW_STARTED',
  'CLAIM_RELEASED',
  'FORWARDED',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
  'DISCARDED',
] as const;
export type CalculationEventType = (typeof CALCULATION_EVENT_TYPES)[number];

export interface CalculationEventDto {
  id: string;
  type: CalculationEventType;
  fromStatus: CalculationStatus | null;
  toStatus: CalculationStatus;
  actor: { id: string; name: string };
  comment: string | null;
  relatedCalculationId: string | null;
  createdAt: string;
}

/**
 * 409 CALCULATION_BLOCKED: an input the chosen route needs is missing or doesn't cover
 * the record's period. `details.missing` lists what is needed, in words.
 */
export const CALCULATION_BLOCKED_CODE = 'CALCULATION_BLOCKED';

export interface CalculationBlockedDetails {
  missing: string[];
}
