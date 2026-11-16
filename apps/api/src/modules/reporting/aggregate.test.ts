import { describe, expect, it } from 'vitest';
import { aggregate, coveredDays, type ReportRecordRow } from './aggregate.js';
import { cell } from './csv.js';
import { todayIn } from '../../lib/dates.js';
import { daysElapsed, parsePeriod, trailingMonths } from './period.js';

describe('report periods', () => {
  it('parses months, calendar quarters and years', () => {
    expect(parsePeriod('2024-02')).toMatchObject({
      granularity: 'MONTH',
      label: 'February 2024',
      start: '2024-02-01',
      end: '2024-02-29',
      days: 29,
    });
    expect(parsePeriod('2026-Q4')).toMatchObject({
      granularity: 'QUARTER',
      start: '2026-10-01',
      end: '2026-12-31',
      days: 92,
    });
    expect(parsePeriod('2026')).toMatchObject({ granularity: 'YEAR', days: 365 });
    for (const bad of ['2026-00', '2026-13', '2026-Q0', '1999', '2026-q1', '2026-3']) {
      expect(parsePeriod(bad), bad).toBeNull();
    }
  });

  it('lists the twelve months ending with a month, across a year end', () => {
    const months = trailingMonths('2026-02');
    expect(months.map((m) => m.key)).toEqual([
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('counts elapsed days up to today in the facility’s time zone', () => {
    // 23:30 UTC on 31 Jan is already 1 Feb in Lagos (UTC+1).
    const now = new Date('2026-01-31T23:30:00Z');
    expect(todayIn('Africa/Lagos', now)).toBe('2026-02-01');
    expect(todayIn('UTC', now)).toBe('2026-01-31');
    expect(daysElapsed('2026-02-01', '2026-02-28', '2026-02-01')).toBe(1);
    expect(daysElapsed('2026-02-01', '2026-02-28', '2026-01-31')).toBe(0);
    expect(daysElapsed('2026-02-01', '2026-02-28', '2026-05-01')).toBe(28);
  });

  it('counts each covered day once', () => {
    expect(
      coveredDays([
        { start: '2026-01-01', end: '2026-01-05' },
        { start: '2026-01-04', end: '2026-01-06' },
        { start: '2026-01-06', end: '2026-01-06' },
      ]),
    ).toBe(6);
  });
});

const facility = { id: 'f', name: 'Bonny', code: 'F-1', timeZone: 'Africa/Lagos' };
const asset = { id: 'a', name: 'Flow station', code: 'A-1' };
const flareSource = { id: 's', name: 'HP', code: 'S-1' };

function rec(id: string, overrides: Partial<ReportRecordRow> = {}): ReportRecordRow {
  return {
    id,
    activityType: 'ROUTINE_FLARING',
    periodStart: '2026-01-10',
    periodEnd: '2026-01-10',
    status: 'APPROVED',
    revisionOfId: null,
    volumeMmscf: '1',
    facility,
    asset,
    flareSource,
    approvedCalculation: null,
    calculationsInProgress: 0,
    ...overrides,
  };
}

function calc(id: string, co2e: string, quality: 'MEASURED_BASIS' | 'ESTIMATED' = 'ESTIMATED') {
  return {
    id,
    version: 1,
    route: 'IPCC_REFERENCE_FLARING' as const,
    editionId: 'e1',
    edition: 1,
    dataQuality: quality,
    co2Tonnes: co2e,
    ch4Tonnes: '0',
    n2oTonnes: '0',
    co2eTonnes: co2e,
    approvedAt: '2026-02-01T00:00:00.000Z',
  };
}

describe('aggregation', () => {
  const jan = parsePeriod('2026-01');
  if (!jan) throw new Error('period');
  const today = () => '2026-11-16';

  it('adds exactly, without floating-point error, beyond 20 significant digits', () => {
    const result = aggregate(
      [
        rec('r1', { approvedCalculation: calc('c1', '0.1'), volumeMmscf: '0.1' }),
        rec('r2', {
          approvedCalculation: calc('c2', '0.2', 'MEASURED_BASIS'),
          volumeMmscf: '0.2',
          periodStart: '2026-01-11',
          periodEnd: '2026-01-11',
        }),
        rec('r3', {
          approvedCalculation: calc('c3', '123456789012345678.12345678901234567891'),
          periodStart: '2026-01-12',
          periodEnd: '2026-01-12',
        }),
      ],
      jan,
      today,
    );
    expect(result.summary.total).toMatchObject({
      co2eTonnes: '123456789012345678.42345678901234567891',
      measuredBasisCo2eTonnes: '0.2',
      estimatedCo2eTonnes: '123456789012345678.22345678901234567891',
    });
    expect(result.summary.total).not.toHaveProperty('volumeCalculatedMmscf');
    expect(result.summary.byType[0]?.emissions?.volumeCalculatedMmscf).toBe('1.3');
  });

  it('never counts a record that is not approved, and never sums volumes across types', () => {
    const result = aggregate(
      [
        rec('r1', { approvedCalculation: calc('c1', '5') }),
        rec('r2', { status: 'AWAITING_APPROVAL', approvedCalculation: calc('c2', '7') }),
        rec('r3', { activityType: 'VENTING', volumeMmscf: '2' }),
        rec('r4', { volumeMmscf: null }),
        rec('r5', { periodStart: '2025-12-31', approvedCalculation: calc('c5', '9') }),
      ],
      jan,
      today,
    );
    expect(result.summary.total?.co2eTonnes).toBe('5');
    expect(result.summary.byType.map((t) => [t.activityType, t.approvedVolumeMmscf])).toEqual([
      ['ROUTINE_FLARING', '1'],
      ['VENTING', '2'],
    ]);
    expect(result.summary.byType[0]?.coverage).toMatchObject({
      approvedRecords: 2,
      recordsNotYetApproved: 1,
      approvedRecordsWithoutVolume: 1,
      approvedRecordsAwaitingCalculation: 1,
    });
    expect(result.unplaced.map((u) => [u.activityRecordId, u.co2eTonnes])).toEqual([['r5', '9']]);
  });
});

describe('CSV cells', () => {
  it('neutralises spreadsheet formulas and quotes separators', () => {
    expect(cell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(cell('+1')).toBe("'+1");
    expect(cell('-2')).toBe("'-2");
    expect(cell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(cell('Bonny, Rivers')).toBe('"Bonny, Rivers"');
    expect(cell('0.00000000000000000001')).toBe('0.00000000000000000001');
    expect(cell(null)).toBe('');
  });
});
