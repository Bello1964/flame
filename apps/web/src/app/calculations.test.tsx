import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type {
  CalculationDto,
  MethodologyEditionDto,
  MethodologyEditionSummaryDto,
  Role,
} from '@flame/shared';
import {
  ADA,
  list,
  membership,
  mockApi,
  on,
  ORG_A,
  renderApp,
  sessionWith,
} from '@/test/render-app';
import { RECORD_ID, SOURCE_ID, record, source } from '@/test/activity-fixtures';

/** Sample data for interface tests only: not real operational or emissions data. */

afterEach(() => {
  vi.unstubAllGlobals();
});

const EDITION_1 = 'e0000000-0000-4000-8000-000000000001';
const EDITION_2 = 'e0000000-0000-4000-8000-000000000002';
const CALC_ID = 'c1000000-0000-4000-8000-000000000001';

function edition(overrides: Partial<MethodologyEditionDto> = {}): MethodologyEditionDto {
  return {
    id: EDITION_1,
    code: 'flame-flaring-venting',
    edition: 1,
    title: 'Flame flaring and venting emissions methodology',
    summary: 'How Flame calculates emissions.',
    status: 'APPROVED',
    approvedAt: '2026-11-16T12:00:00.000Z',
    supersededAt: null,
    content: {
      overview: ['tCO₂e is an emissions figure, not a carbon credit.'],
      routes: [
        {
          key: 'COMPOSITION_FLARING',
          title: 'Flaring: measured gas composition',
          appliesTo: 'Flaring',
          requires: ['A gas analysis'],
          steps: [
            {
              key: 'n2o',
              title: 'Nitrous oxide',
              formula: 'N₂O = V ÷ 10⁶ × EF_N₂O × k_t/Gg',
              explanation: 'IPCC factor per volume flared.',
              parameters: ['ipcc.direct.n2o'],
            },
          ],
        },
      ],
      decisions: [
        {
          key: 'n2o',
          title: 'N₂O from the IPCC factor per volume flared',
          decision: 'N₂O = volume flared × 0.000023 Gg per 10⁶ m³.',
          reason: 'Neither reference gives a composition-based N₂O method.',
          references: [
            {
              label: 'IPCC 2006 Guidelines, Vol. 2, Ch. 4',
              location: 'Table 4.2.5, footnote e, p. 4.63',
              url: 'https://example.org/ipcc.pdf',
            },
          ],
        },
      ],
      limitations: ['No uncertainty ranges yet.'],
    },
    parameters: [
      {
        key: 'ipcc.direct.n2o',
        kind: 'EMISSION_FACTOR',
        name: 'IPCC N2O emission factor per volume of gas flared (reference case)',
        value: '0.000023',
        unit: 'Gg per 10⁶ m³ flared',
        gas: 'N2O',
        appliesTo: 'N₂O on both flaring routes.',
        sourceOrganisation: 'IPCC',
        sourceDocument: '2006 IPCC Guidelines, Volume 2, Chapter 4',
        sourceEdition: '2006',
        sourceLocation: 'Table 4.2.5, footnote e, p. 4.63',
        sourceUrl: 'https://example.org/ipcc.pdf',
        retrievedOn: '2026-11-16',
        notes: null,
      },
    ],
    provenance: null,
    createdBy: null,
    approvedBy: { id: 'user-9', name: 'Ngozi Admin' },
    createdAt: '2026-11-16T10:00:00.000Z',
    withdrawal: null,
    ...overrides,
  };
}

const summary = (e: MethodologyEditionDto): MethodologyEditionSummaryDto => ({
  id: e.id,
  code: e.code,
  edition: e.edition,
  title: e.title,
  summary: e.summary,
  status: e.status,
  approvedAt: e.approvedAt,
  supersededAt: e.supersededAt,
});

function calculation(overrides: Partial<CalculationDto> = {}): CalculationDto {
  return {
    id: CALC_ID,
    organisationId: ORG_A,
    activityRecordId: RECORD_ID,
    version: 1,
    route: 'COMPOSITION_FLARING',
    edition: {
      id: EDITION_1,
      code: 'flame-flaring-venting',
      edition: 1,
      title: 'Flame flaring and venting emissions methodology',
      status: 'APPROVED',
    },
    efficiencySource: 'METHODOLOGY_DEFAULT',
    flareEfficiencyId: null,
    gasCompositionId: 'g1',
    fallbackReason: null,
    notes: null,
    activity: {
      id: RECORD_ID,
      kind: 'DAILY',
      activityType: 'ROUTINE_FLARING',
      periodStart: '2026-01-10',
      periodEnd: '2026-01-10',
      status: 'APPROVED',
    },
    flareSource: { id: SOURCE_ID, name: 'HP Flare Stack', code: 'HP-1', facilityName: 'Bonny' },
    volumeM3: '566336.93184',
    results: {
      co2Tonnes: '1096.73495923869817657344',
      ch4Tonnes: '6.149231131434172416',
      n2oTonnes: '0.01302574943232',
      co2eTonnes: '1272.36525451841980422144',
      gwp: { co2: '1', ch4: '28', n2o: '265', source: 'Fifth Assessment Report' },
    },
    steps: [
      {
        key: 'n2o',
        title: 'Nitrous oxide',
        formula: 'N₂O = V ÷ 10⁶ × EF_N₂O × k_t/Gg',
        substituted: 'N₂O = 566336.93184 ÷ 1000000 × 0.000023 × 1000 = 0.01302574943232 t',
        values: [
          {
            symbol: 'V',
            label: 'Gas volume',
            value: '566336.93184',
            unit: 'm³',
            origin: 'Step "Gas volume in m³"',
          },
          {
            symbol: 'EF_N₂O',
            label: 'IPCC N2O emission factor',
            value: '0.000023',
            unit: 'Gg per 10⁶ m³ flared',
            parameterKey: 'ipcc.direct.n2o',
          },
        ],
        result: { symbol: 'N₂O', value: '0.01302574943232', unit: 't' },
      },
    ],
    inputs: {
      activity: {
        volumeMmscf: '20',
        volumeOrigin: 'Activity record: total volume',
        measurementBasis: 'MEASURED',
      },
    },
    engineVersion: 'flame-emissions-engine-v1',
    dataQuality: 'ESTIMATED',
    qualityReasons: [
      'The flare efficiency is the methodology default (API Compendium 2009 §4.6), not a test or vendor value',
    ],
    status: 'CALCULATED',
    activityRevised: false,
    submittedAt: null,
    claim: null,
    approval: null,
    supersededAt: null,
    availableActions: ['submit', 'discard'],
    separationOfDuties: null,
    createdBy: { id: 'user-1', name: 'Ada Obi' },
    createdAt: '2026-11-16T13:00:00.000Z',
    updatedAt: '2026-11-16T13:00:00.000Z',
    ...overrides,
  };
}

function signedInAs(roles: Role[], isPlatformAdmin = false) {
  return on('GET', '/auth/session', () => ({
    status: 200,
    body: { data: sessionWith([membership(ORG_A, roles)], { ...ADA, isPlatformAdmin }) },
  }));
}

describe('the public methodology page', () => {
  it('shows every decision with its reason and references, and every number with its source, without signing in', async () => {
    const e = edition();
    mockApi(
      on('GET', '/methodology/editions', () => list([summary(e)])),
      on('GET', `/methodology/editions/${EDITION_1}`, () => ({ status: 200, body: { data: e } })),
    );
    renderApp(`/methodology/editions/${EDITION_1}`);

    expect(await screen.findByRole('heading', { name: e.title })).toBeInTheDocument();
    const decision = document.getElementById('decision-n2o');
    expect(decision).not.toBeNull();
    expect(
      within(decision as HTMLElement).getByText(/Neither reference gives/),
    ).toBeInTheDocument();
    expect(
      within(decision as HTMLElement).getByRole('link', { name: /IPCC 2006 Guidelines/ }),
    ).toHaveAttribute('href', 'https://example.org/ipcc.pdf');
    const number = document.getElementById('param-ipcc-direct-n2o');
    expect(number).not.toBeNull();
    expect(within(number as HTMLElement).getByText('0.000023')).toBeInTheDocument();
    expect(
      within(number as HTMLElement).getByText(/Table 4.2.5, footnote e, p. 4.63/),
    ).toBeInTheDocument();
  });

  it('keeps superseded editions readable and points to the current one', async () => {
    const old = edition({ status: 'SUPERSEDED', supersededAt: '2026-12-01T10:00:00.000Z' });
    const current = edition({ id: EDITION_2, edition: 2 });
    mockApi(
      on('GET', '/methodology/editions', () => list([summary(current), summary(old)])),
      on('GET', `/methodology/editions/${EDITION_1}`, () => ({ status: 200, body: { data: old } })),
    );
    renderApp(`/methodology/editions/${EDITION_1}`);
    expect(await screen.findByText(/A newer edition is in use/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See edition 2' })).toHaveAttribute(
      'href',
      `/methodology/editions/${EDITION_2}`,
    );
  });

  it('says so when no edition has been approved', async () => {
    mockApi(on('GET', '/methodology/editions', () => list([])));
    renderApp('/methodology');
    expect(
      await screen.findByText('Waiting for a Platform Administrator to approve an edition'),
    ).toBeInTheDocument();
  });
});

describe('a calculation page', () => {
  it('shows the result, why it is estimated, and each number linked to the edition it came from', async () => {
    const { requests } = mockApi(
      signedInAs(['DATA_ENTRY_OFFICER']),
      on('GET', `/organisations/${ORG_A}/calculations/${CALC_ID}/history`, () => ({
        status: 200,
        body: { data: [] },
      })),
      on('GET', `/organisations/${ORG_A}/calculations/${CALC_ID}`, () => ({
        status: 200,
        body: { data: calculation() },
      })),
      on('POST', `/organisations/${ORG_A}/calculations/${CALC_ID}/submit`, () => ({
        status: 200,
        body: { data: calculation({ status: 'SUBMITTED', availableActions: ['recall'] }) },
      })),
    );
    renderApp(`/o/${ORG_A}/calculations/${CALC_ID}`);

    expect(await screen.findByTitle('Exact: 1272.36525451841980422144 tCO₂e')).toHaveTextContent(
      '1,272.365',
    );
    expect(screen.getByText(/Not approved: not for official reporting yet/)).toBeInTheDocument();
    expect(screen.getByText('Why this result is estimated')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'IPCC N2O emission factor' })).toHaveAttribute(
      'href',
      `/o/${ORG_A}/methodology/editions/${EDITION_1}#param-ipcc-direct-n2o`,
    );
    expect(screen.getByRole('link', { name: /edition 1/ })).toHaveAttribute(
      'href',
      `/o/${ORG_A}/methodology/editions/${EDITION_1}`,
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByText('Submitted for review.')).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST' && r.path.endsWith('/submit'))).toBe(true);
  });
});

describe('calculating an approved record', () => {
  it('explains what is missing when the calculation can’t run yet', async () => {
    mockApi(
      signedInAs(['DATA_ENTRY_OFFICER']),
      on('GET', `/organisations/${ORG_A}/activity-records/${RECORD_ID}/history`, () => ({
        status: 200,
        body: { data: [] },
      })),
      on('GET', `/organisations/${ORG_A}/activity-records/${RECORD_ID}/calculations`, () => ({
        status: 200,
        body: { data: [] },
      })),
      on('POST', `/organisations/${ORG_A}/activity-records/${RECORD_ID}/calculations`, () => ({
        status: 409,
        body: {
          error: {
            code: 'CALCULATION_BLOCKED',
            message: 'This calculation can’t run until the inputs it needs are available',
            details: {
              missing: ['A gas analysis for this flare source valid from 2026-01-10 or earlier'],
            },
          },
        },
      })),
      on('GET', `/organisations/${ORG_A}/activity-records/${RECORD_ID}`, () => ({
        status: 200,
        body: { data: record({ status: 'APPROVED', availableActions: ['revise'] }) },
      })),
      on('GET', `/organisations/${ORG_A}/flare-sources/${SOURCE_ID}`, () => ({
        status: 200,
        body: { data: source },
      })),
      on('GET', /\/assets\/.+$/, () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'x' } },
      })),
      on('GET', `/organisations/${ORG_A}/settings`, () => ({
        status: 200,
        body: {
          data: {
            defaultReferenceTemperature: { value: '15', unit: 'CELSIUS' },
            defaultReferencePressure: { value: '101.325', unit: 'KPA_ABS' },
            defaultCompressibility: null,
          },
        },
      })),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Calculate emissions' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Calculate' }));
    expect(
      await within(dialog).findByText(/A gas analysis for this flare source/),
    ).toBeInTheDocument();
  });
});

describe('the methodology registry for administrators', () => {
  it('is closed to everyone else', async () => {
    mockApi(signedInAs(['ORGANISATION_OWNER']));
    renderApp('/admin/methodology');
    expect(await screen.findByText('For Platform Administrators only')).toBeInTheDocument();
  });

  it('won’t let the administrator who prepared a draft approve it', async () => {
    const draft = edition({
      status: 'DRAFT',
      approvedAt: null,
      approvedBy: null,
      canApprove: false,
      approvalBlockedReason:
        'You created this draft, so another Platform Administrator must approve it',
    });
    mockApi(
      signedInAs([], true),
      on('GET', `/admin/methodology/editions/${EDITION_1}`, () => ({
        status: 200,
        body: { data: draft },
      })),
    );
    renderApp(`/admin/methodology/${EDITION_1}`);
    expect(await screen.findByText(/You created this draft/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve edition' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Edit IPCC N2O emission factor/ }),
    ).toBeInTheDocument();
  });
});

describe('recording a gas analysis', () => {
  it('shows the running total and won’t send a composition that doesn’t total 100%', async () => {
    const { requests } = mockApi(
      signedInAs(['DATA_ENTRY_OFFICER']),
      on('GET', `/organisations/${ORG_A}/flare-sources/${SOURCE_ID}/gas-compositions`, () => ({
        status: 200,
        body: { data: [] },
      })),
      on('GET', `/organisations/${ORG_A}/flare-sources/${SOURCE_ID}/flare-efficiencies`, () => ({
        status: 200,
        body: { data: [] },
      })),
      on('GET', `/organisations/${ORG_A}/flare-sources/${SOURCE_ID}`, () => ({
        status: 200,
        body: { data: source },
      })),
      on('GET', /\/assets\/.+$/, () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'x' } },
      })),
      on('GET', `/organisations/${ORG_A}/settings`, () => ({
        status: 200,
        body: {
          data: {
            defaultReferenceTemperature: { value: '15', unit: 'CELSIUS' },
            defaultReferencePressure: { value: '101.325', unit: 'KPA_ABS' },
            defaultCompressibility: null,
          },
        },
      })),
      on('GET', `/organisations/${ORG_A}/activity-records`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Record analysis' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Methane \(CH₄\)/), { target: { value: '80' } });
    fireEvent.change(within(dialog).getByLabelText(/Carbon dioxide \(CO₂\)/), {
      target: { value: '12' },
    });
    expect(await within(dialog).findByText('92%')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record analysis' }));
    expect(await within(dialog).findByText(/total 92%/)).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });
});

describe('the methodology inside the app', () => {
  it('opens in the app shell and points administrators to the registry while none is approved', async () => {
    mockApi(
      signedInAs(['ORGANISATION_OWNER'], true),
      on('GET', '/methodology/editions', () => list([])),
    );
    renderApp(`/o/${ORG_A}/methodology`);
    expect(
      await screen.findByText('Waiting for a Platform Administrator to approve an edition'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the methodology registry/ })).toHaveAttribute(
      'href',
      '/admin/methodology',
    );
    // The app navigation is still there, with Methodology as the current page.
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Methodology' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('the app shell on narrow screens', () => {
  it('names every icon-only navigation link and puts organisation and account in compact menus', async () => {
    mockApi(
      signedInAs(['ORGANISATION_OWNER']),
      on('GET', '/methodology/editions', () => list([])),
    );
    renderApp(`/o/${ORG_A}/methodology`);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const link of within(nav).getAllByRole('link')) {
      // Named for screen readers, and on hover through the title.
      expect(link).toHaveAccessibleName();
      expect(link.getAttribute('title')).toBe(link.textContent);
    }
    expect(screen.getByRole('button', { name: /^Organisation: Delta Energy/ })).toHaveAttribute(
      'title',
      'Delta Energy',
    );
    expect(screen.getAllByRole('button', { name: 'Account: Ada Obi' }).length).toBeGreaterThan(0);
  });

  it('sends a Platform Administrator without an organisation to the registry', async () => {
    mockApi(
      on('GET', '/auth/session', () => ({
        status: 200,
        body: { data: sessionWith([], { ...ADA, isPlatformAdmin: true }) },
      })),
      on('GET', '/admin/methodology/editions', () => list([])),
    );
    renderApp('/app');
    expect(
      await screen.findByRole('heading', { name: 'Methodology registry' }),
    ).toBeInTheDocument();
  });

  it('tells a Platform Administrator without an organisation how to reach one, and switches account', async () => {
    const { requests } = mockApi(
      on('GET', '/auth/session', () => ({
        status: 200,
        body: { data: sessionWith([], { ...ADA, isPlatformAdmin: true }) },
      })),
      on('GET', '/admin/methodology/editions', () => list([])),
      on('POST', '/auth/logout', () => ({ status: 204 })),
    );
    const { router } = renderApp('/admin/methodology');
    expect(
      await screen.findByRole('note', { name: 'This account has no organisation access' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and switch account' }));
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(requests.some((r) => r.method === 'POST' && r.path === '/auth/logout')).toBe(true);
  });
});

describe('the methodology registry navigation', () => {
  it('sits in the app shell with a way back to the organisation', async () => {
    mockApi(
      signedInAs(['ORGANISATION_OWNER'], true),
      on('GET', '/admin/methodology/editions', () => list([])),
    );
    renderApp('/admin/methodology');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    // An administrator who belongs to an organisation sees no notice.
    expect(screen.queryByText('This account has no organisation access')).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Methodology registry' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Facilities' })).toHaveAttribute(
      'href',
      `/o/${ORG_A}/facilities`,
    );
    expect(screen.getAllByRole('button', { name: 'Account: Ada Obi' }).length).toBeGreaterThan(0);
  });
});
