import {
  NUPRC_APPENDIX_C_COLUMNS,
  type NuprcMonthlyLogDto,
  type NuprcQuarterlyReportDto,
} from '@flame/shared';
import { ACTIVITY_TYPE_NAMES, cell } from './csv.js';

/** UTF-8 byte-order mark, so spreadsheets read the file as UTF-8. */
const BOM = String.fromCharCode(0xfeff);
const row = (values: (string | number | null)[]) => values.map(cell).join(',');
const file = (lines: string[]) => `${BOM}${lines.join('\r\n')}\r\n`;

export const QUARTERLY_PARTS = ['appendix-c', 'appendix-a', 'gas-totals'] as const;
export type QuarterlyPart = (typeof QUARTERLY_PARTS)[number];
export const MONTHLY_PARTS = ['entries', 'totals'] as const;
export type MonthlyPart = (typeof MONTHLY_PARTS)[number];

/**
 * Quarterly GHG inventory as CSV. `appendix-c` has exactly NUPRC's Appendix C header and
 * rows, ready to paste into NUPRC's Excel template; the other parts are the supporting tables.
 */
export function quarterlyCsv(report: NuprcQuarterlyReportDto, part: QuarterlyPart): string {
  switch (part) {
    case 'appendix-c':
      return file([
        row([...NUPRC_APPENDIX_C_COLUMNS]),
        ...report.appendixC.map((r) =>
          row([
            r.serial,
            r.year,
            r.month,
            r.companyName,
            r.companyAbbreviation,
            r.terrain,
            r.concession,
            r.fieldName,
            r.facilityName,
            r.facilityType,
            r.coordinates,
            r.framework,
            r.emissionSource,
            r.equipmentType,
            r.unit,
            r.co2,
            r.ch4,
            r.n2o,
            r.total,
            r.comments,
          ]),
        ),
      ]);
    case 'appendix-a':
      return file([
        row([
          'S/N',
          'Facility Name',
          'Facility Type',
          'Location',
          'Source Category',
          'Equipment/Source Type',
          'Quantity (# Units)',
          'Segment',
          'Pollutant Emitted',
          'Quantification Method',
          'Uncertainty',
        ]),
        ...report.appendixA.map((r) =>
          row([
            r.serial,
            r.facilityName,
            r.facilityType,
            r.location,
            r.sourceCategory,
            r.equipmentType,
            r.quantity,
            r.segment,
            r.pollutants,
            r.quantificationMethod,
            r.uncertainty,
          ]),
        ),
      ]);
    case 'gas-totals':
      return file([
        row([
          'Facility',
          'Emission source',
          'CO2 (tCO2e)',
          'CH4 (tCO2e)',
          'N2O (tCO2e)',
          'Total (tCO2e)',
          'Approved calculations',
        ]),
        ...report.gasTotals.map((r) =>
          row([r.facilityName, r.emissionSource, r.co2, r.ch4, r.n2o, r.total, r.calculationCount]),
        ),
      ]);
  }
}

/** Monthly flare and vent log (regulation 20) as CSV: the entries, or the totals. */
export function monthlyCsv(log: NuprcMonthlyLogDto, part: MonthlyPart): string {
  if (part === 'totals') {
    return file([
      row(['Facility', 'Flare source code', 'Flare source', 'Flared (MMscf)', 'Vented (MMscf)']),
      ...log.sourceTotals.map((t) =>
        row([t.facilityName, t.flareSourceCode, t.flareSourceName, t.flaredMmscf, t.ventedMmscf]),
      ),
      row(['All sources', null, null, log.totals.flaredMmscf, log.totals.ventedMmscf]),
    ]);
  }
  return file([
    row([
      'Facility',
      'Flare source code',
      'Flare source',
      'Flaring or venting',
      'Activity type',
      'Start date',
      'End date',
      'Start time',
      'Duration (h)',
      'Rate (MMscf/d)',
      'Volume (MMscf)',
      'Volume as entered',
      'Unit as entered',
      'Gas source or type',
      'Measured or estimated',
      'Spans months (not in totals)',
      'CH4 from venting (tCO2e)',
    ]),
    ...log.entries.map((e) =>
      row([
        e.facilityName,
        e.flareSourceCode,
        e.flareSourceName,
        e.emissionSource,
        ACTIVITY_TYPE_NAMES[e.activityType],
        e.periodStart,
        e.periodEnd,
        e.startTime,
        e.durationHours,
        e.rateMmscfd,
        e.volumeMmscf,
        e.originalVolume?.value ?? null,
        e.originalVolume?.unit ?? null,
        e.gasSource,
        e.measurementBasis === 'MEASURED' ? 'Measured' : 'Estimated',
        e.spansMonths ? 'Yes' : 'No',
        e.ch4Co2e,
      ]),
    ),
  ]);
}
