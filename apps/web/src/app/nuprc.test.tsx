import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { IssuedReportDto, NuprcMonthlyLogDto, NuprcQuarterlyReportDto } from '@flame/shared';
import {
  ADA,
  BAYO,
  membership,
  mockApi,
  on,
  ORG_A,
  renderApp,
  sessionWith,
} from '@/test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

const signedInAs = (roles: Parameters<typeof membership>[1], user = ADA) =>
  on('GET', '/auth/session', () => ({
    status: 200,
    body: { data: sessionWith([membership(ORG_A, roles)], user) },
  }));

const period = {
  granularity: 'QUARTER',
  key: '2026-Q3',
  label: 'Q3 2026',
  start: '2026-07-01',
  end: '2026-09-30',
} as const;
const source = { title: 'Guidance Template', issuer: 'NUPRC', url: null, note: 'Data parts only.' };
const coverage = { approvedRecords: 2, withoutApprovedCalculation: 1, awaitingApproval: 0 };

const quarterly: NuprcQuarterlyReportDto = {
  kind: 'QUARTERLY_GHG_INVENTORY',
  source,
  organisation: { id: ORG_A, name: 'Delta Energy', abbreviation: 'DEL' },
  period: period as unknown as NuprcQuarterlyReportDto['period'],
  generatedAt: '2026-11-20T09:00:00.000Z',
  appendixC: [
    {
      serial: 1,
      year: '2026',
      month: 'July',
      companyName: 'Delta Energy',
      companyAbbreviation: 'DEL',
      terrain: 'Onshore',
      concession: 'OML 58',
      fieldName: null,
      facilityId: 'f-1',
      facilityName: 'Okpai Flow Station',
      facilityType: 'Flowstation',
      coordinates: '5.1, 6.7',
      framework: null,
      emissionSource: 'Flaring',
      equipmentType: 'Flare Point (Elevated)',
      unit: 'Tonnes CO2e',
      co2: '1000',
      ch4: '300',
      n2o: '26',
      total: '1326',
      comments: 'IPCC tier not set in methodology edition 1.',
    },
  ],
  appendixA: [],
  gasTotals: [],
  activityTotals: [],
  editions: [],
  gwpConsistent: true,
  coverage,
  unplaced: [],
  notRecorded: ['Combustion (stationary and mobile)'],
  notes: ['Approved data only.'],
};

const monthly: NuprcMonthlyLogDto = {
  kind: 'MONTHLY_FLARE_VENT_LOG',
  source,
  organisation: quarterly.organisation,
  period: {
    ...period,
    granularity: 'MONTH',
    key: '2026-10',
    label: 'October 2026',
  } as unknown as NuprcMonthlyLogDto['period'],
  generatedAt: '2026-11-20T09:00:00.000Z',
  entries: [],
  sourceTotals: [],
  totals: { flaredMmscf: '0', ventedMmscf: '0' },
  coverage,
  unplaced: [],
  notRecorded: [],
  notes: [],
};

function issuedReport(overrides: Partial<IssuedReportDto> = {}): IssuedReportDto {
  return {
    id: 'ir-1',
    kind: 'QUARTERLY_GHG_INVENTORY',
    periodKey: '2026-Q3',
    periodLabel: 'Q3 2026',
    version: 1,
    status: 'AWAITING_APPROVAL',
    reason: null,
    issuedBy: { id: BAYO.id, name: BAYO.name },
    issuedAt: '2026-11-20T09:00:00.000Z',
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionComment: null,
    supersededAt: null,
    submittedOn: null,
    submissionReference: null,
    submissionRecordedBy: null,
    submissionRecordedAt: null,
    snapshot: quarterly,
    ...overrides,
  };
}

const live = [
  on('GET', `/organisations/${ORG_A}/reports/nuprc/quarterly`, () => ({
    status: 200,
    body: { data: quarterly },
  })),
  on('GET', `/organisations/${ORG_A}/reports/nuprc/monthly`, () => ({
    status: 200,
    body: { data: monthly },
  })),
];

describe('NUPRC reports page', () => {
  it('shows Appendix C with NUPRC’s columns and offers issuing to Approvers', async () => {
    mockApi(
      signedInAs(['APPROVER']),
      ...live,
      on('GET', `/organisations/${ORG_A}/reports/issued`, () => ({
        status: 200,
        body: { data: [] },
      })),
    );
    renderApp(`/o/${ORG_A}/reports/nuprc?report=quarterly&period=2026-Q3`);
    expect(await screen.findByRole('heading', { name: 'NUPRC reports' })).toBeInTheDocument();
    expect(
      await screen.findByRole('columnheader', {
        name: 'FRAMEWORK ADOPTED (Indicate Tier or Level)',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Flare Point (Elevated)' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1326' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appendix C (CSV)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Issue this report/ })).toBeEnabled();
    expect(screen.getByText(/Nothing issued yet/)).toBeInTheDocument();
  });

  it('hides issuing from Viewers', async () => {
    mockApi(
      signedInAs(['VIEWER']),
      ...live,
      on('GET', `/organisations/${ORG_A}/reports/issued`, () => ({
        status: 200,
        body: { data: [] },
      })),
    );
    renderApp(`/o/${ORG_A}/reports/nuprc?report=monthly&period=2026-10`);
    expect(await screen.findByText(/No approved flaring or venting records/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Issue this report/ })).toBeNull();
  });

  it('issues with the period and kind, then opens the issued report', async () => {
    const { requests } = mockApi(
      signedInAs(['APPROVER']),
      ...live,
      on('GET', `/organisations/${ORG_A}/reports/issued`, () => ({
        status: 200,
        body: { data: [] },
      })),
      on('POST', `/organisations/${ORG_A}/reports/issued`, () => ({
        status: 201,
        body: { data: issuedReport({ issuedBy: { id: ADA.id, name: ADA.name } }) },
      })),
      on('GET', `/organisations/${ORG_A}/reports/issued/ir-1`, () => ({
        status: 200,
        body: { data: issuedReport({ issuedBy: { id: ADA.id, name: ADA.name } }) },
      })),
    );
    const { router } = renderApp(`/o/${ORG_A}/reports/nuprc?report=quarterly&period=2026-Q3`);
    fireEvent.click(await screen.findByRole('button', { name: /Issue this report/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue report' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/o/${ORG_A}/reports/issued/ir-1`);
    });
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      kind: 'QUARTERLY_GHG_INVENTORY',
      period: '2026-Q3',
    });
    // The issuer can't approve their own report.
    expect(
      await screen.findByText(/another Owner or Approver must approve or reject it/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});

describe('issued report page', () => {
  it('lets another Approver approve, then record the submission', async () => {
    let current = issuedReport();
    const { requests } = mockApi(
      signedInAs(['APPROVER']),
      on('GET', `/organisations/${ORG_A}/reports/issued/ir-1`, () => ({
        status: 200,
        body: { data: current },
      })),
      on('GET', `/organisations/${ORG_A}/reports/issued`, () => ({
        status: 200,
        body: { data: [current] },
      })),
      on('POST', `/organisations/${ORG_A}/reports/issued/ir-1/approve`, () => {
        current = issuedReport({
          status: 'APPROVED',
          approvedBy: { id: ADA.id, name: ADA.name },
          approvedAt: '2026-11-20T10:00:00.000Z',
        });
        return { status: 200, body: { data: current } };
      }),
    );
    renderApp(`/o/${ORG_A}/reports/issued/ir-1`);
    expect(
      await screen.findByRole('heading', {
        name: /Quarterly GHG emissions inventory — Q3 2026, version 1/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Frozen when issued/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(
      await screen.findByRole('button', { name: /Record submission to NUPRC/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Approved · not submitted')).toBeInTheDocument();
    expect(requests.some((r) => r.path.endsWith('/approve'))).toBe(true);
  });
});
