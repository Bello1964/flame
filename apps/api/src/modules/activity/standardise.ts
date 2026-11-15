import { Prisma } from '../../generated/prisma/client.js';
import type { PressureUnit, RateUnit, TemperatureUnit, VolumeUnit } from '@carbon/shared';

/**
 * Standardisation of gas activity quantities to the platform's canonical reference
 * condition, ISO 13443 (15 °C, 101.325 kPa absolute). Pure functions; no I/O.
 * Rules: docs/architecture/ARCHITECTURAL_WORKFLOW.md §4.1.
 *
 *   V_ref = V_src × (P_src / P_ref) × (T_ref / T_src) × (Z_ref / Z_src)
 *
 * with absolute temperature (K) and absolute pressure (kPa), followed by a volume-unit
 * conversion. Every constant below is derived from exact SI definitions (none is
 * empirical); those that don't terminate (psi in kPa, °F to K) are evaluated to 40
 * significant digits.
 */

/** Bump when the formula or any constant changes; stored with every result. */
export const CONVERSION_VERSION = 'iso13443-real-gas-v1';

/** 40 significant digits, banker's rounding: far beyond any measurement precision. */
const D = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_EVEN });
type Dec = InstanceType<typeof D>;

/** Stored scale of standardised results (numeric(40, 20)). */
const RESULT_SCALE = 20;

// ─── Exact constants ─────────────────────────────────────────────────────────

/** ISO 13443 standard reference conditions for natural gas. */
const T_REF_K = new D('288.15');
const P_REF_KPA = new D('101.325');
/** 0 °C in kelvin (exact by definition of the Celsius scale). */
const ZERO_CELSIUS_K = new D('273.15');
/** 1 ft = 0.3048 m exactly (international foot), so 1 ft³ = 0.028316846592 m³ exactly. */
const M3_PER_FT3 = new D('0.3048').pow(3);
/**
 * 1 psi = 1 lbf / in², with 1 lb = 0.45359237 kg, g_n = 9.80665 m/s² and
 * 1 in = 0.0254 m, all exact. Expressed in kPa.
 */
const KPA_PER_PSI = new D('0.45359237').mul('9.80665').div(new D('0.0254').pow(2)).div(1000);
/** 1 bar = 100 kPa exactly. */
const KPA_PER_BAR = new D(100);
const MILLION = new D('1e6');
const BILLION = new D('1e9');

// ─── Unit conversions ────────────────────────────────────────────────────────

export function toKelvin(value: string, unit: TemperatureUnit): Dec {
  const v = new D(value);
  switch (unit) {
    case 'KELVIN':
      return v;
    case 'CELSIUS':
      return v.add(ZERO_CELSIUS_K);
    case 'FAHRENHEIT':
      return v.sub(32).mul(5).div(9).add(ZERO_CELSIUS_K);
  }
}

export function toKpaAbsolute(value: string, unit: PressureUnit): Dec {
  const v = new D(value);
  switch (unit) {
    case 'KPA_ABS':
      return v;
    case 'BAR_ABS':
      return v.mul(KPA_PER_BAR);
    case 'PSIA':
      return v.mul(KPA_PER_PSI);
  }
}

/** Cubic metres (at the source condition) for a volume. */
function volumeToM3(value: string, unit: VolumeUnit): Dec {
  const v = new D(value);
  switch (unit) {
    case 'SM3':
      return v;
    case 'MMSM3':
      return v.mul(MILLION);
    case 'MMSCF':
      return v.mul(MILLION).mul(M3_PER_FT3);
    case 'BCF':
      return v.mul(BILLION).mul(M3_PER_FT3);
  }
}

/** Cubic metres per day (at the source condition) for a rate. */
function rateToM3PerDay(value: string, unit: RateUnit): Dec {
  const v = new D(value);
  switch (unit) {
    case 'SM3_PER_DAY':
      return v;
    case 'MMSM3_PER_DAY':
      return v.mul(MILLION);
    case 'MMSCF_PER_DAY':
      return v.mul(MILLION).mul(M3_PER_FT3);
  }
}

function m3ToMmscf(m3: Dec): Dec {
  return m3.div(M3_PER_FT3).div(MILLION);
}

/** True when the source condition is exactly the canonical one (15 °C, 101.325 kPa). */
export function isCanonicalCondition(
  temperature: { value: string; unit: TemperatureUnit },
  pressure: { value: string; unit: PressureUnit },
): boolean {
  return (
    toKelvin(temperature.value, temperature.unit).eq(T_REF_K) &&
    toKpaAbsolute(pressure.value, pressure.unit).eq(P_REF_KPA)
  );
}

// ─── Standardisation ─────────────────────────────────────────────────────────

export interface StandardiseInput {
  averageRate: { value: string; unit: RateUnit } | null;
  totalVolume: { value: string; unit: VolumeUnit } | null;
  operatingHours: string | null;
  referenceTemperature: { value: string; unit: TemperatureUnit };
  referencePressure: { value: string; unit: PressureUnit };
  /** Required (both) when the source condition is not canonical; must be absent when it is. */
  zSource: string | null;
  zReference: string | null;
}

export interface StandardiseResult {
  correctionFactor: string;
  standardRateMmscfd: string | null;
  standardVolumeMmscf: string | null;
  derivedVolumeMmscf: string | null;
  conversionVersion: string;
  /** Everything needed to reproduce the result, stored as JSON. */
  details: {
    formula: string;
    canonicalCondition: { temperatureK: string; pressureKpa: string; standard: string };
    sourceCondition: { temperatureK: string; pressureKpa: string; canonical: boolean };
    zSource: string | null;
    zReference: string | null;
    constants: { m3PerFt3: string; kpaPerPsi: string; kpaPerBar: string; zeroCelsiusK: string };
    derivedVolume: string | null;
    arithmetic: string;
  };
}

/** Thrown when the inputs cannot be standardised; `field` names the offending input. */
export class StandardisationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'StandardisationError';
  }
}

/** Results are stored as numeric(40, 20): at most 20 digits before the decimal point. */
const MAX_STORABLE = new D('1e20');

function round(value: Dec): string {
  return value.toDecimalPlaces(RESULT_SCALE, D.ROUND_HALF_EVEN).toFixed(RESULT_SCALE);
}

export function standardise(input: StandardiseInput): StandardiseResult {
  const tSourceK = toKelvin(input.referenceTemperature.value, input.referenceTemperature.unit);
  const pSourceKpa = toKpaAbsolute(input.referencePressure.value, input.referencePressure.unit);
  if (!tSourceK.gt(0)) {
    throw new StandardisationError(
      'referenceTemperature',
      'Temperature must be above absolute zero',
    );
  }
  if (!pSourceKpa.gt(0)) {
    throw new StandardisationError('referencePressure', 'Absolute pressure must be above zero');
  }

  const canonical = tSourceK.eq(T_REF_K) && pSourceKpa.eq(P_REF_KPA);
  const hasZ = input.zSource !== null || input.zReference !== null;

  let correction: Dec;
  if (canonical) {
    if (hasZ) {
      throw new StandardisationError(
        'zSource',
        'Compressibility factors apply only when the reference condition differs from 15 °C and 101.325 kPa',
      );
    }
    correction = new D(1);
  } else {
    if (input.zSource === null || input.zReference === null) {
      throw new StandardisationError(
        input.zSource === null ? 'zSource' : 'zReference',
        'Enter the compressibility factor at the source condition and at 15 °C / 101.325 kPa: the reference condition differs from the platform standard',
      );
    }
    const zSource = new D(input.zSource);
    const zReference = new D(input.zReference);
    if (!zSource.gt(0)) throw new StandardisationError('zSource', 'Z must be greater than zero');
    if (!zReference.gt(0)) {
      throw new StandardisationError('zReference', 'Z must be greater than zero');
    }
    correction = pSourceKpa.div(P_REF_KPA).mul(T_REF_K.div(tSourceK)).mul(zReference.div(zSource));
  }

  const rateMmscfd = input.averageRate
    ? m3ToMmscf(rateToM3PerDay(input.averageRate.value, input.averageRate.unit).mul(correction))
    : null;
  const volumeMmscf = input.totalVolume
    ? m3ToMmscf(volumeToM3(input.totalVolume.value, input.totalVolume.unit).mul(correction))
    : null;
  // Only from a rate and an actual measured duration; a 24-hour day is never assumed.
  const derivedMmscf =
    rateMmscfd && input.operatingHours !== null
      ? rateMmscfd.mul(new D(input.operatingHours)).div(24)
      : null;

  // Safety net: a result that can't be stored faithfully is refused, never saved wrong.
  // (Plausible operating ranges for T, P and Z will be added once sourced values exist.)
  if (!correction.lt(MAX_STORABLE)) {
    throw new StandardisationError(
      'referencePressure',
      'This reference condition is outside what can be standardised; check the temperature, pressure and Z factors',
    );
  }
  const checks: [string, string | undefined, Dec | null][] = [
    ['averageRate', input.averageRate?.value, rateMmscfd],
    ['totalVolume', input.totalVolume?.value, volumeMmscf],
    ['operatingHours', input.operatingHours ?? undefined, derivedMmscf],
  ];
  for (const [field, entered, result] of checks) {
    if (result === null || entered === undefined) continue;
    if (!result.lt(MAX_STORABLE)) {
      throw new StandardisationError(field, 'This value is too large to standardise and store');
    }
    // A non-zero quantity must not standardise to zero (e.g. from an absurd condition).
    if (!new D(entered).isZero() && new D(round(result)).isZero()) {
      throw new StandardisationError(
        field,
        'This value standardises to effectively zero at the given reference condition; check the temperature, pressure and Z factors',
      );
    }
  }

  return {
    correctionFactor: round(correction),
    standardRateMmscfd: rateMmscfd ? round(rateMmscfd) : null,
    standardVolumeMmscf: volumeMmscf ? round(volumeMmscf) : null,
    derivedVolumeMmscf: derivedMmscf ? round(derivedMmscf) : null,
    conversionVersion: CONVERSION_VERSION,
    details: {
      formula: 'V_ref = V_src × (P_src / P_ref) × (T_ref / T_src) × (Z_ref / Z_src)',
      canonicalCondition: {
        temperatureK: T_REF_K.toString(),
        pressureKpa: P_REF_KPA.toString(),
        standard: 'ISO 13443',
      },
      sourceCondition: {
        temperatureK: tSourceK.toString(),
        pressureKpa: pSourceKpa.toString(),
        canonical,
      },
      zSource: input.zSource,
      zReference: input.zReference,
      constants: {
        m3PerFt3: M3_PER_FT3.toString(),
        kpaPerPsi: KPA_PER_PSI.toString(),
        kpaPerBar: KPA_PER_BAR.toString(),
        zeroCelsiusK: ZERO_CELSIUS_K.toString(),
      },
      derivedVolume: derivedMmscf
        ? 'derived volume = standardised rate × operating hours / 24'
        : null,
      arithmetic: `decimal, ${String(D.precision)} significant digits, results at ${String(RESULT_SCALE)} decimal places (half-even)`,
    },
  };
}

/**
 * Relative difference (percent) between the volume derived from rate × duration and the
 * entered volume, both standardised; null when either is missing. Used for the
 * data-quality warning; it never changes any value.
 */
export function rateVolumeDifferencePercent(
  derivedVolumeMmscf: string | null,
  standardVolumeMmscf: string | null,
): Dec | null {
  if (derivedVolumeMmscf === null || standardVolumeMmscf === null) return null;
  const derived = new D(derivedVolumeMmscf);
  const entered = new D(standardVolumeMmscf);
  if (entered.isZero()) return derived.isZero() ? new D(0) : new D(Infinity);
  return derived.sub(entered).abs().div(entered).mul(100);
}

/** Warn when rate × duration and the entered volume differ by more than this. */
export const RATE_VOLUME_TOLERANCE_PERCENT = new D(1);
