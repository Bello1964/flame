/**
 * Display units used across the platform. These are labels only; conversions
 * and authoritative calculations live in the backend.
 */
export const UNIT_LABELS = {
  naira: '₦',
  gasFlowRate: 'MMscf/d',
  gasVolume: 'MMscf',
  emissions: 'tCO2e',
} as const;

export type UnitKey = keyof typeof UNIT_LABELS;
