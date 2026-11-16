import {
  GAS_COMPONENT_LABELS,
  GAS_COMPONENTS,
  type CalculationRoute,
  type CalculationStepDto,
  type CalculationValueDto,
  type GasComponent,
} from '@flame/shared';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * The emissions calculation engine (ARCHITECTURAL_WORKFLOW.md §8.1). Pure: no database,
 * no clock. Every number comes from the inputs or from the methodology edition's
 * parameters, and every step records its formula, the values used and where each came
 * from, so a result can be reproduced by hand from its trace.
 */

export const ENGINE_VERSION = 'flame-emissions-engine-v1';

/** 40 significant digits, banker's rounding (as the volume standardisation). */
const D = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_EVEN });
type Dec = InstanceType<typeof D>;

/** Results are stored and shown to this many decimal places. */
export const RESULT_SCALE = 20;

export class EngineError extends Error {}

export interface EngineParameter {
  value: string;
  unit: string;
  name: string;
}

export interface EngineComposition {
  /** Mole percent per component, exact decimal strings. */
  components: Record<GasComponent, string>;
  hexanesPlusCarbonNumber: string | null;
  /** e.g. "Gas analysis LAB-0423 (sampled 2026-01-05)". */
  origin: string;
}

export interface EngineEfficiency {
  /** Percent of hydrocarbon carbon converted to CO₂. */
  co2ConversionPercent: string;
  /** Percent of methane leaving uncombusted. */
  uncombustedMethanePercent: string;
  /** Where the values came from: a flare record, or methodology parameters. */
  origin: string;
  /** Set when the values are methodology defaults. */
  parameterKeys?: { co2Conversion: string; uncombustedMethane: string };
}

export interface EngineInput {
  route: CalculationRoute;
  /** MMscf at 15 °C and 101.325 kPa. */
  volumeMmscf: string;
  volumeOrigin: string;
  composition?: EngineComposition;
  efficiency?: EngineEfficiency;
  parameters: ReadonlyMap<string, EngineParameter>;
}

export interface EngineResult {
  volumeM3: string;
  co2Tonnes: string;
  ch4Tonnes: string;
  n2oTonnes: string | null;
  co2eTonnes: string;
  steps: CalculationStepDto[];
  /** Parameter keys the calculation used. */
  parametersUsed: string[];
}

/** Exact, plain representation (no exponent, no trailing zeros). */
function show(v: Dec): string {
  return v.toDecimalPlaces(RESULT_SCALE, D.ROUND_HALF_EVEN).toFixed();
}

const CARBON_KEYS: Partial<Record<GasComponent, string>> = {
  methane: 'nc.methane',
  ethane: 'nc.ethane',
  propane: 'nc.propane',
  isoButane: 'nc.butane',
  normalButane: 'nc.butane',
  isoPentane: 'nc.pentane',
  normalPentane: 'nc.pentane',
};

const SYMBOL: Partial<Record<GasComponent, string>> = {
  methane: 'y_CH₄',
  ethane: 'y_C₂H₆',
  propane: 'y_C₃H₈',
  isoButane: 'y_iC₄',
  normalButane: 'y_nC₄',
  isoPentane: 'y_iC₅',
  normalPentane: 'y_nC₅',
  hexanesPlus: 'y_C₆+',
  carbonDioxide: 'y_CO₂',
};

/** Parameters required by each route; a missing one means the edition is unusable. */
export function requiredParameters(route: CalculationRoute): string[] {
  const base = ['conv.m3_per_mmscf', 'gwp.co2', 'gwp.ch4'];
  switch (route) {
    case 'COMPOSITION_FLARING':
      return [
        ...base,
        'ipcc.molar_volume',
        'mw.co2',
        'mw.ch4',
        'conv.kg_per_tonne',
        'conv.tonnes_per_gg',
        'ipcc.direct.n2o',
        'gwp.n2o',
        ...new Set(Object.values(CARBON_KEYS)),
      ];
    case 'IPCC_REFERENCE_FLARING':
      return [
        ...base,
        'ipcc.direct.co2',
        'ipcc.direct.ch4',
        'ipcc.direct.n2o',
        'conv.tonnes_per_gg',
        'gwp.n2o',
      ];
    case 'COMPOSITION_VENTING':
      return [...base, 'ipcc.molar_volume', 'mw.co2', 'mw.ch4', 'conv.kg_per_tonne'];
  }
}

export function calculate(input: EngineInput): EngineResult {
  const used = new Set<string>();
  const p = (key: string): { v: Dec; ref: CalculationValueDto } => {
    const found = input.parameters.get(key);
    if (!found) throw new EngineError(`The methodology edition has no parameter "${key}"`);
    used.add(key);
    return {
      v: new D(found.value),
      ref: {
        symbol: key,
        label: found.name,
        value: found.value,
        unit: found.unit,
        parameterKey: key,
      },
    };
  };
  const fromInput = (symbol: string, label: string, v: string, unit: string, origin: string) => ({
    v: new D(v),
    value: { symbol, label, value: new D(v).toFixed(), unit, origin } satisfies CalculationValueDto,
  });
  const steps: CalculationStepDto[] = [];
  const hundred = new D(100);
  const million = new D(1_000_000);

  // Step: volume in m³.
  const vMmscf = fromInput(
    'V_MMscf',
    'Standardised gas volume',
    input.volumeMmscf,
    'MMscf',
    input.volumeOrigin,
  );
  const k = p('conv.m3_per_mmscf');
  const V = vMmscf.v.times(k.v);
  steps.push({
    key: 'volume',
    title: 'Gas volume in m³',
    formula: 'V = V_MMscf × k_m³',
    substituted: `V = ${vMmscf.value.value} × ${k.ref.value} = ${show(V)} m³`,
    values: [vMmscf.value, { ...k.ref, symbol: 'k_m³' }],
    result: { symbol: 'V', value: show(V), unit: 'm³' },
  });

  let co2: Dec;
  let ch4: Dec;
  let n2o: Dec | null = null;

  const fraction = (c: GasComponent) => {
    const comp = input.composition;
    if (!comp) throw new EngineError('This route needs a gas analysis');
    return new D(comp.components[c]).div(hundred);
  };
  const compValue = (c: GasComponent): CalculationValueDto => ({
    symbol: SYMBOL[c] ?? c,
    label: `${GAS_COMPONENT_LABELS[c]}, mole fraction (mole % ÷ 100)`,
    value: fraction(c).toFixed(),
    unit: 'mol/mol',
    origin: input.composition?.origin ?? '',
  });

  const molesStep = () => {
    const rho = p('ipcc.molar_volume');
    const n = V.times(rho.v);
    steps.push({
      key: 'moles',
      title: 'Moles of gas',
      formula: 'n = V × ρ_mol',
      substituted: `n = ${show(V)} × ${rho.ref.value} = ${show(n)} kmol`,
      values: [
        {
          symbol: 'V',
          label: 'Gas volume',
          value: show(V),
          unit: 'm³',
          origin: 'Step "Gas volume in m³"',
        },
        { ...rho.ref, symbol: 'ρ_mol' },
      ],
      result: { symbol: 'n', value: show(n), unit: 'kmol' },
    });
    return n;
  };

  const n2oStep = () => {
    const ef = p('ipcc.direct.n2o');
    const tPerGg = p('conv.tonnes_per_gg');
    const result = V.div(million).times(ef.v).times(tPerGg.v);
    steps.push({
      key: 'n2o',
      title: 'Nitrous oxide',
      formula: 'N₂O = V ÷ 10⁶ × EF_N₂O × k_t/Gg',
      substituted: `N₂O = ${show(V)} ÷ 1000000 × ${ef.ref.value} × ${tPerGg.ref.value} = ${show(result)} t`,
      values: [
        {
          symbol: 'V',
          label: 'Gas volume',
          value: show(V),
          unit: 'm³',
          origin: 'Step "Gas volume in m³"',
        },
        { ...ef.ref, symbol: 'EF_N₂O' },
        { ...tPerGg.ref, symbol: 'k_t/Gg' },
      ],
      result: { symbol: 'N₂O', value: show(result), unit: 't' },
    });
    return result;
  };

  switch (input.route) {
    case 'COMPOSITION_FLARING': {
      const comp = input.composition;
      const eff = input.efficiency;
      if (!comp) throw new EngineError('Composition flaring needs a gas analysis');
      if (!eff) throw new EngineError('Composition flaring needs a flare efficiency');
      const n = molesStep();

      // Hydrocarbon carbon per mole of gas.
      let carbon = new D(0);
      const carbonValues: CalculationValueDto[] = [];
      const terms: string[] = [];
      for (const c of GAS_COMPONENTS) {
        const key = CARBON_KEYS[c];
        if (key === undefined && c !== 'hexanesPlus') continue;
        const y = fraction(c);
        let nc: Dec;
        if (c === 'hexanesPlus') {
          if (y.isZero()) continue;
          if (comp.hexanesPlusCarbonNumber === null) {
            throw new EngineError('The gas analysis has C₆+ but no carbon number');
          }
          nc = new D(comp.hexanesPlusCarbonNumber);
          carbonValues.push(compValue(c), {
            symbol: 'N_C,C₆+',
            label: 'Carbon atoms per molecule of the C₆+ fraction',
            value: nc.toFixed(),
            unit: 'mol C/mol',
            origin: comp.origin,
          });
        } else {
          const param = p(key ?? '');
          nc = param.v;
          carbonValues.push(compValue(c), {
            ...param.ref,
            symbol: `N_C,${(SYMBOL[c] ?? c).slice(2)}`,
          });
        }
        carbon = carbon.plus(y.times(nc));
        terms.push(`${y.toFixed()} × ${nc.toFixed()}`);
      }
      steps.push({
        key: 'carbon',
        title: 'Hydrocarbon carbon per mole of gas',
        formula: 'C = Σ (y_i × N_C,i),  y_i = mole % ÷ 100',
        substituted: `C = ${terms.join(' + ')} = ${show(carbon)} mol C/mol`,
        values: carbonValues,
        result: { symbol: 'C', value: show(carbon), unit: 'mol C/mol' },
      });

      // CO₂ (API Equation 4-15).
      const mwCo2 = p('mw.co2');
      const kgPerT = p('conv.kg_per_tonne');
      const yCo2 = fraction('carbonDioxide');
      const eta = new D(eff.co2ConversionPercent);
      if (eff.parameterKeys) p(eff.parameterKeys.co2Conversion);
      co2 = n.times(carbon.times(eta).div(hundred).plus(yCo2)).times(mwCo2.v).div(kgPerT.v);
      steps.push({
        key: 'co2',
        title: 'Carbon dioxide',
        formula: 'CO₂ = n × (C × η ÷ 100 + y_CO₂) × MW_CO₂ ÷ k_kg/t',
        substituted: `CO₂ = ${show(n)} × (${show(carbon)} × ${eta.toFixed()} ÷ 100 + ${yCo2.toFixed()}) × ${mwCo2.ref.value} ÷ ${kgPerT.ref.value} = ${show(co2)} t`,
        values: [
          {
            symbol: 'n',
            label: 'Moles of gas',
            value: show(n),
            unit: 'kmol',
            origin: 'Step "Moles of gas"',
          },
          {
            symbol: 'C',
            label: 'Hydrocarbon carbon per mole',
            value: show(carbon),
            unit: 'mol C/mol',
            origin: 'Step "Hydrocarbon carbon per mole of gas"',
          },
          eff.parameterKeys
            ? { ...p(eff.parameterKeys.co2Conversion).ref, symbol: 'η' }
            : {
                symbol: 'η',
                label: 'Carbon converted to CO₂',
                value: eta.toFixed(),
                unit: '%',
                origin: eff.origin,
              },
          compValue('carbonDioxide'),
          { ...mwCo2.ref, symbol: 'MW_CO₂' },
          { ...kgPerT.ref, symbol: 'k_kg/t' },
        ],
        result: { symbol: 'CO₂', value: show(co2), unit: 't' },
      });

      // CH₄ (API Equation 4-16).
      const mwCh4 = p('mw.ch4');
      const yCh4 = fraction('methane');
      const f = new D(eff.uncombustedMethanePercent);
      ch4 = n.times(yCh4).times(f).div(hundred).times(mwCh4.v).div(kgPerT.v);
      steps.push({
        key: 'ch4',
        title: 'Methane (uncombusted)',
        formula: 'CH₄ = n × y_CH₄ × f ÷ 100 × MW_CH₄ ÷ k_kg/t',
        substituted: `CH₄ = ${show(n)} × ${yCh4.toFixed()} × ${f.toFixed()} ÷ 100 × ${mwCh4.ref.value} ÷ ${kgPerT.ref.value} = ${show(ch4)} t`,
        values: [
          {
            symbol: 'n',
            label: 'Moles of gas',
            value: show(n),
            unit: 'kmol',
            origin: 'Step "Moles of gas"',
          },
          compValue('methane'),
          eff.parameterKeys
            ? { ...p(eff.parameterKeys.uncombustedMethane).ref, symbol: 'f' }
            : {
                symbol: 'f',
                label: 'Methane leaving uncombusted',
                value: f.toFixed(),
                unit: '%',
                origin: eff.origin,
              },
          { ...mwCh4.ref, symbol: 'MW_CH₄' },
          { ...kgPerT.ref, symbol: 'k_kg/t' },
        ],
        result: { symbol: 'CH₄', value: show(ch4), unit: 't' },
      });

      n2o = n2oStep();
      break;
    }

    case 'IPCC_REFERENCE_FLARING': {
      const tPerGg = p('conv.tonnes_per_gg');
      const direct = (gas: 'co2' | 'ch4', symbol: string, title: string) => {
        const ef = p(`ipcc.direct.${gas}`);
        const result = V.div(million).times(ef.v).times(tPerGg.v);
        steps.push({
          key: gas,
          title,
          formula: `${symbol} = V ÷ 10⁶ × EF_${symbol} × k_t/Gg`,
          substituted: `${symbol} = ${show(V)} ÷ 1000000 × ${ef.ref.value} × ${tPerGg.ref.value} = ${show(result)} t`,
          values: [
            {
              symbol: 'V',
              label: 'Gas volume',
              value: show(V),
              unit: 'm³',
              origin: 'Step "Gas volume in m³"',
            },
            { ...ef.ref, symbol: `EF_${symbol}` },
            { ...tPerGg.ref, symbol: 'k_t/Gg' },
          ],
          result: { symbol, value: show(result), unit: 't' },
        });
        return result;
      };
      co2 = direct('co2', 'CO₂', 'Carbon dioxide');
      ch4 = direct('ch4', 'CH₄', 'Methane');
      n2o = n2oStep();
      break;
    }

    case 'COMPOSITION_VENTING': {
      if (!input.composition) throw new EngineError('Venting needs a gas analysis');
      const n = molesStep();
      const kgPerT = p('conv.kg_per_tonne');
      const vented = (gas: 'ch4' | 'co2', c: GasComponent, symbol: string, title: string) => {
        const mw = p(`mw.${gas}`);
        const y = fraction(c);
        const result = n.times(y).times(mw.v).div(kgPerT.v);
        steps.push({
          key: gas,
          title,
          formula: `${symbol} = n × y_${symbol} × MW_${symbol} ÷ k_kg/t`,
          substituted: `${symbol} = ${show(n)} × ${y.toFixed()} × ${mw.ref.value} ÷ ${kgPerT.ref.value} = ${show(result)} t`,
          values: [
            {
              symbol: 'n',
              label: 'Moles of gas',
              value: show(n),
              unit: 'kmol',
              origin: 'Step "Moles of gas"',
            },
            compValue(c),
            { ...mw.ref, symbol: `MW_${symbol}` },
            { ...kgPerT.ref, symbol: 'k_kg/t' },
          ],
          result: { symbol, value: show(result), unit: 't' },
        });
        return result;
      };
      ch4 = vented('ch4', 'methane', 'CH₄', 'Methane');
      co2 = vented('co2', 'carbonDioxide', 'CO₂', 'Carbon dioxide');
      break;
    }
  }

  // tCO₂e with the edition's GWP values; origins name the steps as titled above.
  const stepTitle = (key: string) => `Step "${steps.find((s) => s.key === key)?.title ?? key}"`;
  const gCo2 = p('gwp.co2');
  const gCh4 = p('gwp.ch4');
  const gN2o = n2o === null ? null : p('gwp.n2o');
  let co2e = co2.times(gCo2.v).plus(ch4.times(gCh4.v));
  if (n2o !== null && gN2o) co2e = co2e.plus(n2o.times(gN2o.v));
  steps.push({
    key: 'co2e',
    title: 'Carbon dioxide equivalent',
    formula: `tCO₂e = CO₂ × GWP_CO₂ + CH₄ × GWP_CH₄${n2o === null ? '' : ' + N₂O × GWP_N₂O'}`,
    substituted: `tCO₂e = ${show(co2)} × ${gCo2.ref.value} + ${show(ch4)} × ${gCh4.ref.value}${
      n2o === null || !gN2o ? '' : ` + ${show(n2o)} × ${gN2o.ref.value}`
    } = ${show(co2e)} tCO₂e`,
    values: [
      {
        symbol: 'CO₂',
        label: 'Carbon dioxide',
        value: show(co2),
        unit: 't',
        origin: stepTitle('co2'),
      },
      { ...gCo2.ref, symbol: 'GWP_CO₂' },
      { symbol: 'CH₄', label: 'Methane', value: show(ch4), unit: 't', origin: stepTitle('ch4') },
      { ...gCh4.ref, symbol: 'GWP_CH₄' },
      ...(n2o === null || !gN2o
        ? []
        : [
            {
              symbol: 'N₂O',
              label: 'Nitrous oxide',
              value: show(n2o),
              unit: 't',
              origin: stepTitle('n2o'),
            },
            { ...gN2o.ref, symbol: 'GWP_N₂O' },
          ]),
    ],
    result: { symbol: 'tCO₂e', value: show(co2e), unit: 'tCO₂e' },
  });

  return {
    volumeM3: show(V),
    co2Tonnes: show(co2),
    ch4Tonnes: show(ch4),
    n2oTonnes: n2o === null ? null : show(n2o),
    co2eTonnes: show(co2e),
    steps,
    parametersUsed: [...used].sort(),
  };
}
