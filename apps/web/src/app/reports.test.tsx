import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type {
  ActivityType,
  EmissionsReportDto,
  EmissionsTotalsDto,
  EmissionsTrendDto,
  ReportCoverageDto,
} from '@flame/shared';
import {
  ADA,
  facility,
  list,
  membership,
  mockApi,
  on,
  ORG_A,
  renderApp,
  sessionWith,
} from '@/test/render-app';
import { niceTicks } from '@/features/reporting/chart-scale';
import { convertPeriod, shiftPeriod, trendEndMonth } from '@/features/reporting/periods';

/** Sample data for interface tests only: not real operational or emissions data. */

afterEach(() => {
  vi.unstubAllGlobals();
});

const FACILITY_ID = 'f0000000-0000-4000-8000-000000000001';

const coverage = (overrides: Partial<ReportCoverageDto> = {}): ReportCoverageDto => ({
  approvedRecords: 2,
  approvedRecordsCalculated: 1,
  approvedRecordsAwaitingCalculation: 1,
  calculationsInProgress: 1,
  recordsNotYetApproved: 0,
  openRevisions: 0,
  approvedRecordsWithoutVolume: 0,
  ...overrides,
});

const totals = (overrides: Partial<EmissionsTotalsDto> = {}): EmissionsTotalsDto => ({
  calculationCount: 1,
  co2Tonnes: '1000',
  ch4Tonnes: '2',
  n2oTonnes: '0.01',
  co2eTonnes: '1058.65',
  measuredBasisCo2eTonnes: '0',
  estimatedCo2eTonnes: '1058.65',
  volumeCalculatedMmscf: '20',
  ...overrides,
});

function report(overrides: Partial<EmissionsReportDto> = {}): EmissionsReportDto {
  const byType = [
    {
      activityType: 'ROUTINE_FLARING' as ActivityType,
      emissions: totals(),
      approvedVolumeMmscf: '40',
      coverage: coverage(),
    },
  ];
  return {
    basis: 'Emissions (tCO₂e). Approved calculations only. Not carbon credits.',
    organisation: { id: ORG_A, name: 'Delta Energy' },
    period: {
      granularity: 'MONTH',
      key: '2026-01',
      label: 'January 2026',
      start: '2026-01-01',
      end: '2026-01-31',
      days: 31,
    },
    filters: { facilityId: null, activityType: null },
    facility: null,
    generatedAt: '2026-11-16T12:00:00.000Z',
    referenceCondition: 'ISO 13443 (15 °C, 101.325 kPa)',
    summary: { byType, total: totals() },
    facilities: [
      {
        id: FACILITY_ID,
        name: 'Bonny',
        code: 'F-1',
        timeZone: 'Africa/Lagos',
        byType,
        total: totals(),
        assets: [
          {
            id: 'a1',
            name: 'Flow station',
            code: 'A-1',
            byType,
            total: totals(),
            flareSources: [
              {
                id: 's1',
                name: 'HP Flare',
                code: 'S-1',
                byType,
                total: totals(),
                dayCoverage: [{ activityType: 'ROUTINE_FLARING', daysCovered: 2, daysElapsed: 31 }],
              },
            ],
          },
        ],
      },
    ],
    editions: [
      {
        id: 'e1',
        code: 'flame-flaring-venting',
        edition: 1,
        title: 'Flame flaring and venting',
        gwp: { co2: '1', ch4: '28', n2o: '265' },
        calculationCount: 1,
      },
    ],
    gwpConsistent: true,
    calculations: [],
    unplaced: [
      {
        activityRecordId: 'r9',
        facilityCode: 'F-1',
        flareSourceCode: 'S-1',
        flareSourceName: 'HP Flare',
        activityType: 'ROUTINE_FLARING',
        periodStart: '2026-01-25',
        periodEnd: '2026-02-05',
        co2eTonnes: null,
      },
    ],
    ...overrides,
  };
}

function trend(): EmissionsTrendDto {
  const none = {
    ROUTINE_FLARING: null,
    NON_ROUTINE_FLARING: null,
    EMERGENCY_FLARING: null,
    VENTING: null,
    OTHER_RELEASE: null,
  };
  return {
    basis: 'Emissions (tCO₂e). Approved calculations only. Not carbon credits.',
    filters: { facilityId: null, activityType: null },
    months: Array.from({ length: 12 }, (_, i) => {
      const key = i < 11 ? `2025-${String(i + 2).padStart(2, '0')}` : '2026-01';
      return key === '2026-01'
        ? {
            key,
            label: 'January 2026',
            byType: { ...none, ROUTINE_FLARING: '1058.65' },
            total: '1058.65',
            includesEstimated: true,
          }
        : { key, label: key, byType: none, total: null, includesEstimated: false };
    }),
  };
}

function signedIn() {
  return on('GET', '/auth/session', () => ({
    status: 200,
    body: { data: sessionWith([membership(ORG_A, ['VIEWER'])], ADA) },
  }));
}

describe('period navigation', () => {
  it('moves between months, quarters and years', () => {
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2026-Q4', 1)).toBe('2027-Q1');
    expect(shiftPeriod('2026', -1)).toBe('2025');
    expect(convertPeriod('2026-05', 'QUARTER')).toBe('2026-Q2');
    expect(convertPeriod('2026-Q3', 'MONTH')).toBe('2026-07');
    expect(convertPeriod('2026-Q3', 'YEAR')).toBe('2026');
    expect(trendEndMonth('2026-Q1')).toBe('2026-03');
    expect(trendEndMonth('2026')).toBe('2026-12');
  });

  it('chooses round gridlines covering the largest value', () => {
    expect(niceTicks(1058.65)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(0)).toEqual([0]);
  });
});

describe('the reports page', () => {
  it('shows approved totals with their period, basis, coverage and boundary records', async () => {
    const { requests } = mockApi(
      signedIn(),
      on('GET', `/organisations/${ORG_A}/facilities`, () =>
        list([facility({ id: FACILITY_ID, name: 'Bonny', code: 'F-1' })]),
      ),
      on('GET', `/organisations/${ORG_A}/reports/emissions`, () => ({
        status: 200,
        body: { data: report() },
      })),
      on('GET', `/organisations/${ORG_A}/reports/emissions/trend`, () => ({
        status: 200,
        body: { data: trend() },
      })),
    );
    renderApp(`/o/${ORG_A}/reports?period=2026-01`);

    expect(await screen.findByRole('heading', { name: 'Emissions reports' })).toBeInTheDocument();
    const headline = (await screen.findByText(/Total emissions · January 2026/)).closest('section');
    expect(headline).not.toBeNull();
    const h = within(headline as HTMLElement);
    expect(h.getAllByText('1,058.65').length).toBeGreaterThan(0);
    expect(h.getByText('tCO₂e', { selector: 'p > span' })).toBeInTheDocument();
    expect(h.getByText(/Approved calculations only\. Not carbon credits\./)).toBeInTheDocument();
    expect(h.getByText(/Part of this total is estimated/)).toBeInTheDocument();

    const notice = screen.getByRole('heading', { name: 'Not included in these figures' });
    const n = within(notice.closest('section') as HTMLElement);
    expect(n.getByText(/1 approved record has no approved calculation yet/)).toBeInTheDocument();
    expect(n.getByText(/crosses the period boundary/)).toBeInTheDocument();

    expect(screen.getByText(/flaring: approved records cover/)).toHaveTextContent('2 of 31');
    expect(screen.getByRole('heading', { name: 'Not placed in this period' })).toBeInTheDocument();
    expect(screen.getByText('Total, all activity types (tCO₂e only)')).toBeInTheDocument();

    // The CSV link carries the same period and filters.
    expect(screen.getByRole('link', { name: /Download CSV/ })).toHaveAttribute(
      'href',
      `/api/v1/organisations/${ORG_A}/reports/emissions.csv?period=2026-01`,
    );
    // The trend ends with the report's last month.
    expect(requests.some((r) => r.path.endsWith('/trend?endMonth=2026-01'))).toBe(true);

    // The table view carries the chart's values.
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const row = screen.getByRole('rowheader', { name: /January 2026/ }).closest('tr');
    expect(within(row as HTMLElement).getAllByText('1,058.65')).toHaveLength(2);
  });

  it('switches to the quarter and filters by activity type through the URL', async () => {
    const { requests } = mockApi(
      signedIn(),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([])),
      on('GET', `/organisations/${ORG_A}/reports/emissions`, () => ({
        status: 200,
        body: { data: report() },
      })),
      on('GET', `/organisations/${ORG_A}/reports/emissions/trend`, () => ({
        status: 200,
        body: { data: trend() },
      })),
    );
    renderApp(`/o/${ORG_A}/reports?period=2026-02`);
    await screen.findByText(/Total emissions/);

    fireEvent.click(screen.getByRole('button', { name: 'Quarter' }));
    fireEvent.change(screen.getByLabelText('Activity type'), { target: { value: 'VENTING' } });
    await vi.waitFor(() => {
      expect(
        requests.some((r) =>
          r.path.endsWith('/reports/emissions?period=2026-Q1&activityType=VENTING'),
        ),
      ).toBe(true);
    });
  });

  it('says plainly when there are no approved figures', async () => {
    mockApi(
      signedIn(),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([])),
      on('GET', `/organisations/${ORG_A}/reports/emissions`, () => ({
        status: 200,
        body: {
          data: report({
            summary: { byType: [], total: null },
            facilities: [],
            editions: [],
            unplaced: [],
          }),
        },
      })),
      on('GET', `/organisations/${ORG_A}/reports/emissions/trend`, () => ({
        status: 200,
        body: {
          data: {
            ...trend(),
            months: trend().months.map((m) => ({ ...m, total: null })),
          },
        },
      })),
    );
    renderApp(`/o/${ORG_A}/reports?period=2026-01`);
    expect(await screen.findByText('No approved calculations in this period')).toBeInTheDocument();
    expect(screen.getByText('Nothing recorded in January 2026')).toBeInTheDocument();
    expect(screen.getByText('No approved emissions in these twelve months')).toBeInTheDocument();
  });
});
