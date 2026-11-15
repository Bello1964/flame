import { describe, expect, it } from 'vitest';
import {
  CONVERSION_VERSION,
  isCanonicalCondition,
  rateVolumeDifferencePercent,
  standardise,
  StandardisationError,
  toKelvin,
  toKpaAbsolute,
  type StandardiseInput,
} from './standardise.js';

/** ISO 13443 source condition: no correction, no Z. */
const atCanonical: Pick<
  StandardiseInput,
  'referenceTemperature' | 'referencePressure' | 'zSource' | 'zReference'
> = {
  referenceTemperature: { value: '15', unit: 'CELSIUS' },
  referencePressure: { value: '101.325', unit: 'KPA_ABS' },
  zSource: null,
  zReference: null,
};

function run(overrides: Partial<StandardiseInput>) {
  return standardise({
    averageRate: null,
    totalVolume: null,
    operatingHours: null,
    ...atCanonical,
    ...overrides,
  });
}

function errorOf(fn: () => unknown): StandardisationError {
  try {
    fn();
  } catch (err) {
    if (err instanceof StandardisationError) return err;
    throw err;
  }
  throw new Error('expected a StandardisationError');
}

describe('exact unit conversions', () => {
  it('converts temperatures to kelvin exactly', () => {
    expect(toKelvin('15', 'CELSIUS').toString()).toBe('288.15');
    expect(toKelvin('59', 'FAHRENHEIT').toString()).toBe('288.15');
    expect(toKelvin('288.15', 'KELVIN').toString()).toBe('288.15');
    expect(toKelvin('-40', 'FAHRENHEIT').toString()).toBe('233.15');
  });

  it('converts absolute pressures to kPa exactly', () => {
    expect(toKpaAbsolute('1.01325', 'BAR_ABS').toString()).toBe('101.325');
    // 1 psi = 0.45359237 kg × 9.80665 m/s² / (0.0254 m)² = 6894.757293168361… Pa
    expect(toKpaAbsolute('1', 'PSIA').toFixed(15)).toBe('6.894757293168361');
  });

  it('recognises the canonical condition however it is expressed', () => {
    expect(
      isCanonicalCondition(
        { value: '59', unit: 'FAHRENHEIT' },
        { value: '1.01325', unit: 'BAR_ABS' },
      ),
    ).toBe(true);
    expect(
      isCanonicalCondition({ value: '60', unit: 'FAHRENHEIT' }, { value: '14.73', unit: 'PSIA' }),
    ).toBe(false);
  });
});

describe('standardise at the canonical condition', () => {
  it('derives volume only from rate × actual hours (skill example: 0.25 MMscf/d × 12 h)', () => {
    const r = run({ averageRate: { value: '0.25', unit: 'MMSCF_PER_DAY' }, operatingHours: '12' });
    expect(r.correctionFactor).toBe('1.00000000000000000000');
    expect(r.standardRateMmscfd).toBe('0.25000000000000000000');
    expect(r.derivedVolumeMmscf).toBe('0.12500000000000000000');
    expect(r.conversionVersion).toBe(CONVERSION_VERSION);
    expect(r.details.sourceCondition.canonical).toBe(true);
  });

  it('never assumes a 24-hour day: no hours, no derived volume', () => {
    const r = run({ averageRate: { value: '0.25', unit: 'MMSCF_PER_DAY' } });
    expect(r.derivedVolumeMmscf).toBeNull();
  });

  it('converts metric volumes with the exact cubic-foot definition', () => {
    // 1 MMscf = 1e6 × 0.028316846592 m³ = 28316.846592 m³ exactly.
    expect(run({ totalVolume: { value: '28316.846592', unit: 'SM3' } }).standardVolumeMmscf).toBe(
      '1.00000000000000000000',
    );
    // 1 MMSm³ = 1 / 0.028316846592 MMscf = 35.31466672148859…
    expect(
      run({ totalVolume: { value: '1', unit: 'MMSM3' } }).standardVolumeMmscf?.slice(0, 16),
    ).toBe('35.3146667214885');
    expect(run({ totalVolume: { value: '2', unit: 'BCF' } }).standardVolumeMmscf).toBe(
      '2000.00000000000000000000',
    );
  });

  it('keeps an explicit zero as zero', () => {
    const r = run({ totalVolume: { value: '0', unit: 'MMSCF' } });
    expect(r.standardVolumeMmscf).toBe('0.00000000000000000000');
  });

  it('rejects Z factors when the condition is already canonical', () => {
    const err = errorOf(() => run({ zSource: '0.998', zReference: '0.998' }));
    expect(err.field).toBe('zSource');
  });
});

describe('standardise from another reference condition', () => {
  it('applies (P_src/P_ref) × (T_ref/T_src) × (Z_ref/Z_src)', () => {
    // 20 °C, 101.325 kPa, Z_src = Z_ref = 1 → factor = 288.15 / 293.15
    const r = run({
      referenceTemperature: { value: '20', unit: 'CELSIUS' },
      zSource: '1',
      zReference: '1',
      totalVolume: { value: '1', unit: 'MMSCF' },
    });
    // 288.15 / 293.15 = 0.98294388538291...
    expect(r.correctionFactor.slice(0, 15)).toBe('0.9829438853829');
    expect(r.standardVolumeMmscf).toBe(r.correctionFactor);
    expect(r.details.sourceCondition).toEqual({
      temperatureK: '293.15',
      pressureKpa: '101.325',
      canonical: false,
    });
  });

  it('uses both compressibility factors', () => {
    // Pressure doubled, same temperature, Z_ref/Z_src = 0.998 / 0.990.
    const r = run({
      referencePressure: { value: '202.65', unit: 'KPA_ABS' },
      zSource: '0.990',
      zReference: '0.998',
      averageRate: { value: '1', unit: 'MMSCF_PER_DAY' },
    });
    // 2 × 0.998 / 0.990 = 2.016161616…
    expect(r.correctionFactor.slice(0, 12)).toBe('2.0161616161');
    expect(r.standardRateMmscfd).toBe(r.correctionFactor);
  });

  it('requires both Z factors off the canonical condition', () => {
    const base = { referenceTemperature: { value: '60', unit: 'FAHRENHEIT' as const } };
    expect(errorOf(() => run({ ...base })).field).toBe('zSource');
    expect(errorOf(() => run({ ...base, zSource: '0.998' })).field).toBe('zReference');
    expect(errorOf(() => run({ ...base, zSource: '0', zReference: '1' })).field).toBe('zSource');
  });

  it('rejects temperatures at or below absolute zero and non-positive pressure', () => {
    expect(
      errorOf(() => run({ referenceTemperature: { value: '-273.15', unit: 'CELSIUS' } })).field,
    ).toBe('referenceTemperature');
    expect(errorOf(() => run({ referencePressure: { value: '0', unit: 'KPA_ABS' } })).field).toBe(
      'referencePressure',
    );
  });

  it('records everything needed to reproduce the result', () => {
    const r = run({
      referenceTemperature: { value: '60', unit: 'FAHRENHEIT' },
      referencePressure: { value: '14.73', unit: 'PSIA' },
      zSource: '0.998',
      zReference: '0.997',
      totalVolume: { value: '1', unit: 'MMSCF' },
    });
    expect(r.details.constants.m3PerFt3).toBe('0.028316846592');
    expect(r.details.zSource).toBe('0.998');
    expect(r.details.zReference).toBe('0.997');
    expect(r.details.canonicalCondition).toEqual({
      temperatureK: '288.15',
      pressureKpa: '101.325',
      standard: 'ISO 13443',
    });
  });
});

describe('rateVolumeDifferencePercent', () => {
  it('is null unless both values exist', () => {
    expect(rateVolumeDifferencePercent(null, '1')).toBeNull();
    expect(rateVolumeDifferencePercent('1', null)).toBeNull();
  });

  it('measures the difference relative to the entered volume', () => {
    expect(rateVolumeDifferencePercent('1.01', '1')?.toString()).toBe('1');
    expect(rateVolumeDifferencePercent('1.02', '1')?.toString()).toBe('2');
    expect(rateVolumeDifferencePercent('0', '0')?.toString()).toBe('0');
    expect(rateVolumeDifferencePercent('0.5', '0')?.isFinite()).toBe(false);
  });
});
