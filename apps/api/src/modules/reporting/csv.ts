import {
  type ActivityType,
  type EmissionsReportDto,
  type EmissionsTotalsDto,
  type ReportCoverageDto,
  type ReportSectionDto,
} from '@flame/shared';

/**
 * The CSV export of an emissions report (ARCHITECTURAL_WORKFLOW.md §8.2). Numbers are the
 * exact stored values, never rounded. Starts with a UTF-8 byte-order mark so spreadsheet
 * programs read ₂, ° and ₦ correctly.
 */

export const ACTIVITY_TYPE_NAMES: Record<ActivityType, string> = {
  ROUTINE_FLARING: 'Routine flaring',
  NON_ROUTINE_FLARING: 'Non-routine flaring',
  EMERGENCY_FLARING: 'Emergency flaring',
  VENTING: 'Venting',
  OTHER_RELEASE: 'Other gas release',
};

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (starting with =, +, -, @,
 * tab or carriage return) is prefixed with an apostrophe, so it is shown, never executed.
 */
export function cell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 byte-order mark. */
const BOM = String.fromCharCode(0xfeff);

const row = (values: (string | number | null)[]) => values.map(cell).join(',');

const NA = 'not applicable';

function emissionsCells(e: EmissionsTotalsDto | null): (string | number | null)[] {
  if (!e) return [0, null, null, null, null, null, null, null];
  return [
    e.calculationCount,
    e.co2Tonnes,
    e.ch4Tonnes,
    e.n2oTonnes ?? NA,
    e.co2eTonnes,
    e.measuredBasisCo2eTonnes,
    e.estimatedCo2eTonnes,
    e.volumeCalculatedMmscf,
  ];
}

function coverageCells(c: ReportCoverageDto): number[] {
  return [
    c.approvedRecords,
    c.approvedRecordsCalculated,
    c.approvedRecordsAwaitingCalculation,
    c.calculationsInProgress,
    c.recordsNotYetApproved,
    c.openRevisions,
    c.approvedRecordsWithoutVolume,
  ];
}

export function reportCsv(report: EmissionsReportDto): string {
  const volumeUnit = `MMscf at ${report.referenceCondition}`;
  const emissionsHeader = [
    'Approved calculations',
    'CO2 (t)',
    'CH4 (t)',
    'N2O (t)',
    'Emissions (tCO2e)',
    'Measured basis (tCO2e)',
    'Estimated (tCO2e)',
    `Volume calculated (${volumeUnit})`,
  ];
  const coverageHeader = [
    'Approved records',
    'Approved records calculated',
    'Approved records awaiting calculation',
    'Calculations in progress',
    'Records not yet approved',
    'Open revisions',
    'Approved records without a volume',
  ];
  const typeRows = (section: ReportSectionDto, prefix: (string | null)[]) => [
    ...section.byType.map((t) =>
      row([
        ...prefix,
        ACTIVITY_TYPE_NAMES[t.activityType],
        ...emissionsCells(t.emissions),
        t.approvedVolumeMmscf,
        ...coverageCells(t.coverage),
      ]),
    ),
    row([
      ...prefix,
      'Total, all activity types (sum of the rows above; tCO2e only)',
      ...emissionsCells(section.total),
    ]),
  ];

  const lines: string[] = [
    row(['Flame emissions report']),
    row(['Organisation', report.organisation.name]),
    row(['Period', report.period.label, report.period.start, report.period.end]),
    row(['Basis', report.basis]),
    row([
      'Placement',
      'A record counts only in periods that contain all of its dates; records crossing the period boundary are listed at the end and not counted.',
    ]),
    row(['Generated at (UTC)', report.generatedAt]),
    row(['Volumes', volumeUnit]),
    row([
      'Facility filter',
      report.facility ? `${report.facility.code} ${report.facility.name}` : 'All facilities',
    ]),
    row([
      'Activity type filter',
      report.filters.activityType ? ACTIVITY_TYPE_NAMES[report.filters.activityType] : 'All types',
    ]),
    ...report.editions.map((e) =>
      row([
        'Methodology edition',
        `${e.code} edition ${String(e.edition)}`,
        e.title,
        `GWP CO2 ${e.gwp.co2 ?? '-'}, CH4 ${e.gwp.ch4 ?? '-'}, N2O ${e.gwp.n2o ?? '-'}`,
        `${String(e.calculationCount)} calculations`,
      ]),
    ),
    ...(report.gwpConsistent
      ? []
      : [row(['Warning', 'The methodology editions used here have different GWP values.'])]),
    '',
    row(['Summary by activity type']),
    row([
      'Activity type',
      ...emissionsHeader,
      `Approved volume (${volumeUnit})`,
      ...coverageHeader,
    ]),
    ...typeRows(report.summary, []),
    '',
    row(['By flare source']),
    row([
      'Facility code',
      'Facility',
      'Asset code',
      'Asset',
      'Flare source code',
      'Flare source',
      'Activity type',
      ...emissionsHeader,
      `Approved volume (${volumeUnit})`,
      ...coverageHeader,
      'Days covered',
      'Days elapsed',
    ]),
  ];
  for (const f of report.facilities) {
    for (const a of f.assets) {
      for (const s of a.flareSources) {
        for (const t of s.byType) {
          const days = s.dayCoverage.find((d) => d.activityType === t.activityType);
          lines.push(
            row([
              f.code,
              f.name,
              a.code,
              a.name,
              s.code,
              s.name,
              ACTIVITY_TYPE_NAMES[t.activityType],
              ...emissionsCells(t.emissions),
              t.approvedVolumeMmscf,
              ...coverageCells(t.coverage),
              days?.daysCovered ?? 0,
              days?.daysElapsed ?? 0,
            ]),
          );
        }
      }
    }
  }

  lines.push(
    '',
    row(['Approved calculations included']),
    row([
      'Calculation ID',
      'Version',
      'Activity record ID',
      'Facility code',
      'Asset code',
      'Flare source code',
      'Activity type',
      'Period start',
      'Period end',
      'Route',
      'Methodology edition',
      'Data quality',
      'CO2 (t)',
      'CH4 (t)',
      'N2O (t)',
      'Emissions (tCO2e)',
      `Volume (${volumeUnit})`,
      'Approved at (UTC)',
    ]),
    ...report.calculations.map((c) =>
      row([
        c.id,
        c.version,
        c.activityRecordId,
        c.facilityCode,
        c.assetCode,
        c.flareSourceCode,
        ACTIVITY_TYPE_NAMES[c.activityType],
        c.periodStart,
        c.periodEnd,
        c.route,
        c.edition,
        c.dataQuality === 'MEASURED_BASIS' ? 'Measured basis' : 'Estimated',
        c.co2Tonnes,
        c.ch4Tonnes,
        c.n2oTonnes ?? NA,
        c.co2eTonnes,
        c.volumeMmscf,
        c.approvedAt,
      ]),
    ),
    '',
    row([
      'Not placed in this period (approved records crossing the period boundary; not counted above)',
    ]),
    row([
      'Activity record ID',
      'Facility code',
      'Flare source code',
      'Activity type',
      'Period start',
      'Period end',
      'Approved calculation (tCO2e)',
    ]),
    ...report.unplaced.map((u) =>
      row([
        u.activityRecordId,
        u.facilityCode,
        u.flareSourceCode,
        ACTIVITY_TYPE_NAMES[u.activityType],
        u.periodStart,
        u.periodEnd,
        u.co2eTonnes ?? 'none',
      ]),
    ),
  );

  return `${BOM}${lines.join('\r\n')}\r\n`;
}
