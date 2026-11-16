import { describe, expect, it } from 'vitest';
import type { GasComponent } from '@flame/shared';
import {
  calculate,
  EngineError,
  requiredParameters,
  type EngineEfficiency,
  type EngineParameter,
} from './engine.js';

/**
 * Expected values were worked out independently (Python decimal, 60 digits) from the
 * formulas in methodology edition 1; they are not produced by this engine.
 */

/** Edition 1 values, as loaded by the migration. */
const EDITION_1: Record<string, string> = {
  'conv.m3_per_mmscf': '28316.846592',
  'conv.kg_per_tonne': '1000',
  'conv.tonnes_per_gg': '1000',
  'ipcc.molar_volume': '0.0423',
  'mw.ch4': '16.043',
  'mw.co2': '44.011',
  'nc.methane': '1',
  'nc.ethane': '2',
  'nc.propane': '3',
  'nc.butane': '4',
  'nc.pentane': '5',
  'api.co2_conversion_default': '98',
  'api.ch4_uncombusted_production': '2',
  'api.ch4_uncombusted_refinery': '0.5',
  'ipcc.direct.co2': '2.0',
  'ipcc.direct.ch4': '0.012',
  'ipcc.direct.n2o': '0.000023',
  'gwp.co2': '1',
  'gwp.ch4': '28',
  'gwp.n2o': '265',
};
const parameters = new Map<string, EngineParameter>(
  Object.entries(EDITION_1).map(([k, value]) => [k, { value, unit: 'u', name: k }]),
);

function composition(overrides: Partial<Record<GasComponent, string>>, c6: string | null = null) {
  const zero: Record<GasComponent, string> = {
    methane: '0',
    ethane: '0',
    propane: '0',
    isoButane: '0',
    normalButane: '0',
    isoPentane: '0',
    normalPentane: '0',
    hexanesPlus: '0',
    carbonDioxide: '0',
    nitrogen: '0',
    hydrogenSulphide: '0',
    otherInerts: '0',
  };
  return {
    components: { ...zero, ...overrides },
    hexanesPlusCarbonNumber: c6,
    origin: 'Analysis A-1',
  };
}

/** API Compendium (2009) Exhibit 4.9 gas: 80% CH4, 12% CO2, 2.1% N2, 4.2% C2, 1.3% C3, 0.4% C4. */
const EXHIBIT_4_9 = composition({
  methane: '80',
  carbonDioxide: '12',
  nitrogen: '2.1',
  ethane: '4.2',
  propane: '1.3',
  normalButane: '0.4',
});

describe('IPCC reference-case flaring', () => {
  it('applies the per-volume factors to 1 MMscf', () => {
    const r = calculate({
      route: 'IPCC_REFERENCE_FLARING',
      volumeMmscf: '1',
      volumeOrigin: 'Activity record',
      parameters,
    });
    expect(r).toMatchObject({
      volumeM3: '28316.846592',
      co2Tonnes: '56.633693184',
      ch4Tonnes: '0.339802159104',
      n2oTonnes: '0.000651287471616',
      co2eTonnes: '66.32074481889024',
    });
    expect(r.steps.map((s) => s.key)).toEqual(['volume', 'co2', 'ch4', 'n2o', 'co2e']);
    expect(r.parametersUsed).toEqual(
      expect.arrayContaining(['ipcc.direct.co2', 'ipcc.direct.ch4', 'ipcc.direct.n2o', 'gwp.ch4']),
    );
  });
});

describe('composition-based flaring', () => {
  const run = (
    efficiency: EngineEfficiency = {
      co2ConversionPercent: '98',
      uncombustedMethanePercent: '2',
      origin: 'Test report T-9',
    },
  ) =>
    calculate({
      route: 'COMPOSITION_FLARING',
      volumeMmscf: '20',
      volumeOrigin: 'Activity record',
      composition: EXHIBIT_4_9,
      efficiency,
      parameters,
    });

  it('reproduces API Exhibit 4.9 at the IPCC reference condition', () => {
    const r = run();
    expect(r).toMatchObject({
      volumeM3: '566336.93184',
      co2Tonnes: '1096.73495923869817657344',
      ch4Tonnes: '6.149231131434172416',
      n2oTonnes: '0.01302574943232',
      co2eTonnes: '1272.36525451841980422144',
    });
    // API's published answers (at 60 °F, 379.3 scf/lbmol): 6.1 t CH4 and 1,095 t CO2.
    expect(Math.abs(Number(r.ch4Tonnes) - 6.1) / 6.1).toBeLessThan(0.01);
    expect(Math.abs(Number(r.co2Tonnes) - 1095) / 1095).toBeLessThan(0.01);
  });

  it('records each step with its formula, values and sources', () => {
    const r = run();
    const carbon = r.steps.find((s) => s.key === 'carbon');
    expect(carbon?.result).toEqual({ symbol: 'C', value: '0.939', unit: 'mol C/mol' });
    const co2 = r.steps.find((s) => s.key === 'co2');
    expect(co2?.formula).toBe('CO₂ = n × (C × η ÷ 100 + y_CO₂) × MW_CO₂ ÷ k_kg/t');
    expect(co2?.values).toContainEqual(
      expect.objectContaining({ symbol: 'η', value: '98', origin: 'Test report T-9' }),
    );
    expect(co2?.values).toContainEqual(
      expect.objectContaining({ symbol: 'MW_CO₂', value: '44.011', parameterKey: 'mw.co2' }),
    );
    expect(co2?.substituted).not.toMatch(/object/);
  });

  it('cites the methodology defaults when they are used', () => {
    const r = run({
      co2ConversionPercent: '98',
      uncombustedMethanePercent: '2',
      origin: 'Methodology default',
      parameterKeys: {
        co2Conversion: 'api.co2_conversion_default',
        uncombustedMethane: 'api.ch4_uncombusted_production',
      },
    });
    expect(r.parametersUsed).toEqual(
      expect.arrayContaining(['api.co2_conversion_default', 'api.ch4_uncombusted_production']),
    );
    const ch4 = r.steps.find((s) => s.key === 'ch4');
    expect(ch4?.values).toContainEqual(
      expect.objectContaining({ symbol: 'f', parameterKey: 'api.ch4_uncombusted_production' }),
    );
  });

  it('uses the C6+ carbon number from the analysis and refuses without one', () => {
    const withC6 = calculate({
      route: 'COMPOSITION_FLARING',
      volumeMmscf: '1',
      volumeOrigin: 'x',
      composition: composition({ methane: '90', hexanesPlus: '10' }, '6.5'),
      efficiency: { co2ConversionPercent: '100', uncombustedMethanePercent: '0', origin: 'x' },
      parameters,
    });
    // C = 0.9 × 1 + 0.1 × 6.5 = 1.55
    expect(withC6.steps.find((s) => s.key === 'carbon')?.result.value).toBe('1.55');
    expect(() =>
      calculate({
        route: 'COMPOSITION_FLARING',
        volumeMmscf: '1',
        volumeOrigin: 'x',
        composition: composition({ methane: '90', hexanesPlus: '10' }),
        efficiency: { co2ConversionPercent: '98', uncombustedMethanePercent: '2', origin: 'x' },
        parameters,
      }),
    ).toThrow(EngineError);
  });
});

describe('composition-based venting', () => {
  it('emits all methane and CO2 in the gas, with no N2O', () => {
    const r = calculate({
      route: 'COMPOSITION_VENTING',
      volumeMmscf: '1',
      volumeOrigin: 'x',
      composition: composition({ methane: '90', carbonDioxide: '2', nitrogen: '8' }),
      parameters,
    });
    expect(r).toMatchObject({
      ch4Tonnes: '17.29471255715860992',
      co2Tonnes: '1.054329814114993152',
      n2oTonnes: null,
      co2eTonnes: '485.306281414556070912',
    });
    expect(r.steps.find((s) => s.key === 'moles')?.result.value).toBe('1197.8026108416');
    expect(r.steps.find((s) => s.key === 'co2e')?.formula).not.toMatch(/N₂O/);
  });
});

describe('inputs that are missing', () => {
  it('refuses rather than assume', () => {
    expect(() =>
      calculate({ route: 'COMPOSITION_VENTING', volumeMmscf: '1', volumeOrigin: 'x', parameters }),
    ).toThrow(/gas analysis/);
    expect(() =>
      calculate({
        route: 'COMPOSITION_FLARING',
        volumeMmscf: '1',
        volumeOrigin: 'x',
        composition: EXHIBIT_4_9,
        parameters,
      }),
    ).toThrow(/efficiency/);
    const partial = new Map(parameters);
    partial.delete('gwp.ch4');
    expect(() =>
      calculate({
        route: 'IPCC_REFERENCE_FLARING',
        volumeMmscf: '1',
        volumeOrigin: 'x',
        parameters: partial,
      }),
    ).toThrow(/gwp\.ch4/);
  });

  it('lists every parameter each route needs', () => {
    for (const route of [
      'COMPOSITION_FLARING',
      'IPCC_REFERENCE_FLARING',
      'COMPOSITION_VENTING',
    ] as const) {
      for (const key of requiredParameters(route)) expect(EDITION_1).toHaveProperty([key]);
    }
  });
});
