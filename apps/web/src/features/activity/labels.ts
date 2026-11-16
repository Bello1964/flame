import type {
  ActivityRecordDto,
  ActivityType,
  MeasurementBasis,
  MeasurementMethod,
  PressureUnit,
  TemperatureUnit,
} from '@flame/shared';
import { formatDate } from '@/lib/format';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  ROUTINE_FLARING: 'Routine flaring',
  NON_ROUTINE_FLARING: 'Non-routine flaring',
  EMERGENCY_FLARING: 'Emergency flaring',
  VENTING: 'Venting',
  OTHER_RELEASE: 'Other gas release',
};

/** Venting and other releases are not combustion; the interface keeps them visibly apart. */
export function isFlaring(type: ActivityType): boolean {
  return (
    type === 'ROUTINE_FLARING' || type === 'NON_ROUTINE_FLARING' || type === 'EMERGENCY_FLARING'
  );
}

export const BASIS_LABELS: Record<MeasurementBasis, string> = {
  MEASURED: 'Measured',
  ESTIMATED: 'Estimated',
};

export const METHOD_LABELS: Record<MeasurementMethod, string> = {
  METERED: 'Metered',
  CALCULATED: 'Calculated',
  ENGINEERING_ESTIMATE: 'Engineering estimate',
  OTHER: 'Other',
};

export function periodLabel(r: Pick<ActivityRecordDto, 'kind' | 'periodStart' | 'periodEnd'>) {
  return r.kind === 'DAILY'
    ? formatDate(r.periodStart)
    : `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}`;
}

/**
 * Whether a reference condition is exactly the canonical one (15 °C, 101.325 kPa).
 * Display aid for showing or hiding the Z fields; the server decides authoritatively.
 * The canonical point has exact representations only in these units (none in psia).
 */
export function isCanonicalCondition(
  temperature: { value: string; unit: TemperatureUnit },
  pressure: { value: string; unit: PressureUnit },
): boolean {
  const t = Number(temperature.value);
  const p = Number(pressure.value);
  if (temperature.value.trim() === '' || pressure.value.trim() === '') return false;
  const canonicalT =
    (temperature.unit === 'CELSIUS' && t === 15) ||
    (temperature.unit === 'FAHRENHEIT' && t === 59) ||
    (temperature.unit === 'KELVIN' && t === 288.15);
  const canonicalP =
    (pressure.unit === 'KPA_ABS' && p === 101.325) ||
    (pressure.unit === 'BAR_ABS' && p === 1.01325);
  return canonicalT && canonicalP;
}
