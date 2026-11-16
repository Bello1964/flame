import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ActivityRecordDto, FlareSourceDto, Role } from '@carbon/shared';
import { list, membership, mockApi, on, ORG_A, renderApp, sessionWith } from '@/test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

const SOURCE_ID = 'c0000000-0000-4000-8000-000000000001';
const RECORD_ID = 'd0000000-0000-4000-8000-000000000001';

const source: FlareSourceDto = {
  id: SOURCE_ID,
  organisationId: ORG_A,
  assetId: 'a0000000-0000-4000-8000-000000000001',
  name: 'HP Flare Stack',
  code: 'HP-1',
  description: null,
  flareType: 'ELEVATED',
  status: 'ACTIVE',
  archivedAt: null,
  createdById: 'user-1',
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
};

function record(overrides: Partial<ActivityRecordDto> = {}): ActivityRecordDto {
  return {
    id: RECORD_ID,
    organisationId: ORG_A,
    flareSourceId: SOURCE_ID,
    kind: 'DAILY',
    activityType: 'ROUTINE_FLARING',
    otherTypeDescription: null,
    periodStart: '2026-01-10',
    periodEnd: '2026-01-10',
    timeZone: 'Africa/Lagos',
    averageRate: { value: '0.25', unit: 'MMSCF_PER_DAY', entered: '0.250' },
    totalVolume: null,
    operatingHours: { value: '12', entered: '12' },
    referenceTemperature: { value: '15', unit: 'CELSIUS', entered: '15' },
    referencePressure: { value: '101.325', unit: 'KPA_ABS', entered: '101.325' },
    zSource: null,
    zReference: null,
    compressibilitySource: null,
    measurementBasis: 'MEASURED',
    estimateExplanation: null,
    measurementMethod: 'METERED',
    methodDescription: null,
    dataSource: 'MANUAL',
    notes: null,
    standardised: {
      referenceCondition: 'ISO 13443 (15 °C, 101.325 kPa)',
      averageRateMmscfd: '0.25',
      totalVolumeMmscf: null,
      derivedVolumeMmscf: '0.125',
      correctionFactor: '1',
      conversionVersion: 'iso13443-real-gas-v1',
      standardisedAt: '2026-11-15T10:00:00.000Z',
    },
    status: 'DRAFT',
    withdrawal: null,
    overlapAcknowledgedAt: null,
    warnings: [{ code: 'NO_EVIDENCE', message: 'No supporting evidence is attached' }],
    createdById: 'user-1',
    updatedById: 'user-1',
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  };
}

const settings = {
  status: 200,
  body: {
    data: {
      defaultReferenceTemperature: { value: '15', unit: 'CELSIUS' },
      defaultReferencePressure: { value: '101.325', unit: 'KPA_ABS' },
      defaultCompressibility: null,
    },
  },
};

function signedInAs(...roles: Role[]) {
  return on('GET', '/auth/session', () => ({
    status: 200,
    body: { data: sessionWith([membership(ORG_A, roles)]) },
  }));
}

/** The flare source page with its hierarchy, settings and a given activity list. */
function flareSourcePage(
  roles: Role[],
  records: ActivityRecordDto[],
  ...extra: Parameters<typeof mockApi>
) {
  return mockApi(
    signedInAs(...roles),
    on('GET', `/organisations/${ORG_A}/flare-sources/${SOURCE_ID}`, () => ({
      status: 200,
      body: { data: source },
    })),
    on('GET', /\/assets\/.+$/, () => ({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'x' } },
    })),
    on('GET', `/organisations/${ORG_A}/settings`, () => settings),
    ...extra,
    on('GET', `/organisations/${ORG_A}/activity-records`, () => list(records)),
  );
}

async function openForm() {
  // Enabled once the organisation's default reference condition has loaded.
  const button = (await screen.findAllByRole('button', { name: /record activity/i }))[0]!;
  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  fireEvent.click(button);
  return screen.findByRole('dialog');
}

describe('activity on a flare source page', () => {
  it('shows entered values with their units, apart from the standardised volume', async () => {
    flareSourcePage(
      ['VIEWER'],
      [
        record(),
        record({
          id: 'd0000000-0000-4000-8000-000000000002',
          activityType: 'VENTING',
          averageRate: null,
          totalVolume: { value: '1500', unit: 'SM3', entered: '1500' },
          operatingHours: null,
          standardised: {
            ...record().standardised,
            averageRateMmscfd: null,
            derivedVolumeMmscf: null,
            totalVolumeMmscf: '0.0529720001',
          },
        }),
      ],
    );
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);

    const table = await screen.findByRole('table');
    // Each type appears twice: its own column, and under the period on phones (CSS decides).
    expect(within(table).getAllByText('Routine flaring')).toHaveLength(2);
    expect(within(table).getAllByText('Venting')).toHaveLength(2);
    expect(within(table).getByText('0.250')).toBeInTheDocument(); // as entered, not "0.25"
    expect(within(table).getByText('(derived)')).toBeInTheDocument();
    // A viewer can read but not record.
    expect(screen.queryByRole('button', { name: /record activity/i })).not.toBeInTheDocument();
  });

  it('offers recording to data entry officers', async () => {
    flareSourcePage(['DATA_ENTRY_OFFICER'], []);
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);
    expect(await screen.findByText('No activity recorded yet')).toBeInTheDocument();
    expect((await screen.findAllByRole('button', { name: /record activity/i }))[0]).toBeEnabled();
  });
});

describe('recording activity', () => {
  it('prefills the default reference condition and sends values exactly as typed', async () => {
    const { requests } = flareSourcePage(
      ['DATA_ENTRY_OFFICER'],
      [],
      on('POST', `/organisations/${ORG_A}/activity-records`, () => ({
        status: 201,
        body: { data: record() },
      })),
    );
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);
    const dialog = await openForm();

    expect(within(dialog).getByRole('textbox', { name: /^temperature/i })).toHaveValue('15');
    expect(within(dialog).getByRole('textbox', { name: /^absolute pressure/i })).toHaveValue(
      '101.325',
    );
    expect(within(dialog).getByText(/no compressibility correction applies/i)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/^date/i), { target: { value: '2026-01-10' } });
    fireEvent.change(within(dialog).getByLabelText(/^average rate/i), {
      target: { value: '0.250' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^actual operating hours/i), {
      target: { value: '12' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Activity record added as a draft.')).toBeInTheDocument();
    const post = requests.find((r) => r.method === 'POST');
    expect(post?.body).toEqual({
      flareSourceId: SOURCE_ID,
      kind: 'DAILY',
      periodStart: '2026-01-10',
      periodEnd: null,
      activityType: 'ROUTINE_FLARING',
      otherTypeDescription: null,
      averageRate: { value: '0.250', unit: 'MMSCF_PER_DAY' },
      totalVolume: null,
      operatingHours: '12',
      referenceTemperature: { value: '15', unit: 'CELSIUS' },
      referencePressure: { value: '101.325', unit: 'KPA_ABS' },
      zSource: null,
      zReference: null,
      compressibilitySource: null,
      measurementBasis: 'MEASURED',
      estimateExplanation: null,
      measurementMethod: 'METERED',
      methodDescription: null,
      notes: null,
    });
  });

  it('asks for both Z factors when the reference condition is not the standard one', async () => {
    const { requests } = flareSourcePage(['DATA_ENTRY_OFFICER'], []);
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);
    const dialog = await openForm();

    fireEvent.change(within(dialog).getByLabelText(/temperature unit/i), {
      target: { value: 'FAHRENHEIT' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^temperature/i }), {
      target: { value: '60' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^date/i), { target: { value: '2026-01-10' } });
    fireEvent.change(within(dialog).getByLabelText(/^total volume/i), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    expect(await within(dialog).findByLabelText(/^z at this condition/i)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/required because the condition differs/i)).toHaveLength(2);
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('requires an explanation for an estimate before contacting the API', async () => {
    const { requests } = flareSourcePage(['DATA_ENTRY_OFFICER'], []);
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);
    const dialog = await openForm();

    fireEvent.change(within(dialog).getByLabelText(/^date/i), { target: { value: '2026-01-10' } });
    fireEvent.change(within(dialog).getByLabelText(/^total volume/i), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByLabelText('Estimated'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    expect(
      await within(dialog).findByText('Explain how the estimate was made'),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('warns about an overlap and saves only after the user confirms', async () => {
    let attempts = 0;
    const { requests } = flareSourcePage(
      ['DATA_ENTRY_OFFICER'],
      [],
      on('POST', `/organisations/${ORG_A}/activity-records`, (req) => {
        attempts += 1;
        return (req.body as { acknowledgeOverlap?: boolean }).acknowledgeOverlap
          ? { status: 201, body: { data: record() } }
          : {
              status: 409,
              body: {
                error: {
                  code: 'OVERLAP_UNCONFIRMED',
                  message: 'Overlaps',
                  details: {
                    overlapping: [{ id: 'x', periodStart: '2026-01-10', periodEnd: '2026-01-10' }],
                  },
                },
              },
            };
      }),
    );
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText(/^date/i), { target: { value: '2026-01-10' } });
    fireEvent.change(within(dialog).getByLabelText(/^total volume/i), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/overlaps another record/i);
    expect(alert).toHaveTextContent('10 Jan 2026');
    expect(attempts).toBe(1);

    fireEvent.click(within(alert).getByRole('button', { name: 'Save anyway' }));
    expect(await screen.findByText('Activity record added as a draft.')).toBeInTheDocument();
    const posts = requests.filter((r) => r.method === 'POST');
    expect((posts[1]?.body as { acknowledgeOverlap?: boolean }).acknowledgeOverlap).toBe(true);
  });

  it('shows API field errors on the matching form field', async () => {
    flareSourcePage(
      ['DATA_ENTRY_OFFICER'],
      [],
      on('POST', `/organisations/${ORG_A}/activity-records`, () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            details: {
              formErrors: [],
              fieldErrors: { periodStart: ["Dates in the future can't be recorded"] },
            },
          },
        },
      })),
    );
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText(/^date/i), { target: { value: '2026-01-10' } });
    fireEvent.change(within(dialog).getByLabelText(/^total volume/i), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    expect(
      await within(dialog).findByText("Dates in the future can't be recorded"),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^date/i)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('an activity record page', () => {
  function recordPage(roles: Role[], r: ActivityRecordDto, ...extra: Parameters<typeof mockApi>) {
    return mockApi(
      signedInAs(...roles),
      on('GET', `/organisations/${ORG_A}/activity-records/${RECORD_ID}`, () => ({
        status: 200,
        body: { data: r },
      })),
      on('GET', `/organisations/${ORG_A}/flare-sources/${SOURCE_ID}`, () => ({
        status: 200,
        body: { data: source },
      })),
      on('GET', /\/assets\/.+$/, () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'x' } },
      })),
      on('GET', `/organisations/${ORG_A}/settings`, () => settings),
      ...extra,
    );
  }

  it('separates values as entered from standardised values and shows warnings', async () => {
    recordPage(
      ['VIEWER'],
      record({
        warnings: [
          {
            code: 'RATE_VOLUME_MISMATCH',
            message: 'Rate × operating hours differs from the entered volume by 33.33%',
            differencePercent: '33.33',
          },
          { code: 'NO_EVIDENCE', message: 'No supporting evidence is attached' },
        ],
      }),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    expect(await screen.findByRole('heading', { name: '10 Jan 2026' })).toBeInTheDocument();
    expect(screen.getByText(/differs from the entered volume by 33.33%/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'As entered' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /standardised to iso 13443/i })).toBeInTheDocument();
    expect(screen.getByTitle('Exact: 0.125 MMscf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
  });

  it('withdraws only with a reason', async () => {
    const { requests } = recordPage(
      ['DATA_ENTRY_OFFICER'],
      record(),
      on('POST', `/organisations/${ORG_A}/activity-records/${RECORD_ID}/withdraw`, () => ({
        status: 200,
        body: {
          data: record({
            status: 'WITHDRAWN',
            withdrawal: { at: '2026-11-15T11:00:00.000Z', byId: 'user-1', reason: 'Wrong day' },
            warnings: [],
          }),
        },
      })),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw record' }));
    expect(await within(dialog).findByText('Give a reason for withdrawing')).toBeInTheDocument();
    expect(requests.some((r) => r.path.endsWith('/withdraw'))).toBe(false);

    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'Wrong day' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw record' }));
    expect(await screen.findByText('Record withdrawn.')).toBeInTheDocument();
    expect(requests.find((r) => r.path.endsWith('/withdraw'))?.body).toEqual({
      reason: 'Wrong day',
    });
  });

  it('shows a withdrawn record as read-only with its reason', async () => {
    recordPage(
      ['DATA_ENTRY_OFFICER'],
      record({
        status: 'WITHDRAWN',
        withdrawal: { at: '2026-11-15T11:00:00.000Z', byId: 'user-1', reason: 'Wrong day' },
        warnings: [],
      }),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    expect(await screen.findByText(/“Wrong day”/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
  });
});

describe('settings', () => {
  it('is read-only for roles that cannot manage settings', async () => {
    mockApi(
      signedInAs('VIEWER'),
      on('GET', `/organisations/${ORG_A}/settings`, () => settings),
    );
    renderApp(`/o/${ORG_A}/settings`);
    expect(await screen.findByRole('textbox', { name: /^temperature/i })).toBeDisabled();
    expect(screen.getByText(/only owners and administrators/i)).toBeInTheDocument();
  });

  it('lets an owner change the default reference condition', async () => {
    const { requests } = mockApi(
      signedInAs('ORGANISATION_OWNER'),
      on('GET', `/organisations/${ORG_A}/settings`, () => settings),
      on('PATCH', `/organisations/${ORG_A}/settings`, (req) => ({
        status: 200,
        body: { data: req.body },
      })),
    );
    renderApp(`/o/${ORG_A}/settings`);
    fireEvent.change(await screen.findByRole('textbox', { name: /^temperature/i }), {
      target: { value: '60' },
    });
    fireEvent.change(screen.getByLabelText(/temperature unit/i), {
      target: { value: 'FAHRENHEIT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
    await waitFor(() => {
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
        defaultReferenceTemperature: { value: '60', unit: 'FAHRENHEIT' },
        defaultReferencePressure: { value: '101.325', unit: 'KPA_ABS' },
        defaultCompressibility: null,
      });
    });
  });
});

// ─── Review follow-ups (PR #6) ───────────────────────────────────────────────

describe('editing a record', () => {
  it('sends every field as entered, a null end date for a daily record, and no Z at the standard condition', async () => {
    const { requests } = mockApi(
      signedInAs('DATA_ENTRY_OFFICER'),
      on('GET', `/organisations/${ORG_A}/activity-records/${RECORD_ID}`, () => ({
        status: 200,
        body: { data: record() },
      })),
      on('GET', `/organisations/${ORG_A}/flare-sources/${SOURCE_ID}`, () => ({
        status: 200,
        body: { data: source },
      })),
      on('GET', /\/assets\/.+$/, () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'x' } },
      })),
      on('GET', `/organisations/${ORG_A}/settings`, () => settings),
      on('PATCH', `/organisations/${ORG_A}/activity-records/${RECORD_ID}`, () => ({
        status: 200,
        body: { data: record({ notes: 'Meter checked' }) },
      })),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    const edit = await screen.findByRole('button', { name: 'Edit' });
    await waitFor(() => {
      expect(edit).toBeEnabled();
    });
    fireEvent.click(edit);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/^notes/i), {
      target: { value: 'Meter checked' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Activity record saved.')).toBeInTheDocument();
    const body = requests.find((r) => r.method === 'PATCH')?.body;
    expect(body).toEqual({
      periodStart: '2026-01-10',
      periodEnd: null,
      activityType: 'ROUTINE_FLARING',
      otherTypeDescription: null,
      averageRate: { value: '0.250', unit: 'MMSCF_PER_DAY' },
      totalVolume: null,
      operatingHours: '12',
      referenceTemperature: { value: '15', unit: 'CELSIUS' },
      referencePressure: { value: '101.325', unit: 'KPA_ABS' },
      zSource: null,
      zReference: null,
      compressibilitySource: null,
      measurementBasis: 'MEASURED',
      estimateExplanation: null,
      measurementMethod: 'METERED',
      methodDescription: null,
      notes: 'Meter checked',
    });
    // Neither the flare source nor the kind can change on an edit.
    expect(body).not.toHaveProperty('flareSourceId');
    expect(body).not.toHaveProperty('kind');
  });
});

describe('the overlap warning', () => {
  it('goes away when the dates change, so "Save anyway" cannot confirm an unseen overlap', async () => {
    const { requests } = flareSourcePage(
      ['DATA_ENTRY_OFFICER'],
      [],
      on('POST', `/organisations/${ORG_A}/activity-records`, () => ({
        status: 409,
        body: {
          error: {
            code: 'OVERLAP_UNCONFIRMED',
            message: 'Overlaps',
            details: {
              overlapping: [{ id: 'x', periodStart: '2026-01-10', periodEnd: '2026-01-10' }],
            },
          },
        },
      })),
    );
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText(/^date/i), { target: { value: '2026-01-10' } });
    fireEvent.change(within(dialog).getByLabelText(/^total volume/i), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    expect(await within(dialog).findByRole('button', { name: 'Save anyway' })).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/^date/i), { target: { value: '2026-01-11' } });

    await waitFor(() => {
      expect(within(dialog).queryByRole('button', { name: 'Save anyway' })).not.toBeInTheDocument();
    });
    expect(
      requests
        .filter((r) => r.method === 'POST')
        .every((r) => !(r.body as { acknowledgeOverlap?: boolean }).acknowledgeOverlap),
    ).toBe(true);
  });
});

// ─── Organisation Z defaults and the date floor (2026-11-16) ─────────────────

const settingsAt60F = {
  status: 200,
  body: {
    data: {
      defaultReferenceTemperature: { value: '60', unit: 'FAHRENHEIT' },
      defaultReferencePressure: { value: '14.73', unit: 'PSIA' },
      defaultCompressibility: { zSource: '0.998', zReference: '0.997', source: 'GA-2026-03' },
    },
  },
};

describe('organisation Z defaults in the record form', () => {
  function pageWith60FDefaults(...extra: Parameters<typeof mockApi>) {
    return mockApi(
      signedInAs('DATA_ENTRY_OFFICER'),
      on('GET', `/organisations/${ORG_A}/flare-sources/${SOURCE_ID}`, () => ({
        status: 200,
        body: { data: source },
      })),
      on('GET', /\/assets\/.+$/, () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'x' } },
      })),
      on('GET', `/organisations/${ORG_A}/settings`, () => settingsAt60F),
      ...extra,
      on('GET', `/organisations/${ORG_A}/activity-records`, () => list([])),
    );
  }

  it('prefills Z and its source at the default condition, and sends them', async () => {
    const { requests } = pageWith60FDefaults(
      on('POST', `/organisations/${ORG_A}/activity-records`, () => ({
        status: 201,
        body: { data: record() },
      })),
    );
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);
    const dialog = await openForm();

    expect(within(dialog).getByLabelText(/^z at this condition/i)).toHaveValue('0.998');
    expect(within(dialog).getByLabelText(/^z at 15/i)).toHaveValue('0.997');
    expect(within(dialog).getByLabelText(/^source of the z values/i)).toHaveValue('GA-2026-03');
    expect(within(dialog).getByText(/prefilled from your organisation/i)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/^date/i), { target: { value: '2026-01-10' } });
    fireEvent.change(within(dialog).getByLabelText(/^total volume/i), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Activity record added as a draft.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      referenceTemperature: { value: '60', unit: 'FAHRENHEIT' },
      referencePressure: { value: '14.73', unit: 'PSIA' },
      zSource: '0.998',
      zReference: '0.997',
      compressibilitySource: 'GA-2026-03',
    });
  });

  it('clears the default Z when the record moves to another condition', async () => {
    pageWith60FDefaults();
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);
    const dialog = await openForm();

    fireEvent.change(within(dialog).getByRole('textbox', { name: /^temperature/i }), {
      target: { value: '70' },
    });

    await waitFor(() => {
      expect(within(dialog).getByLabelText(/^z at this condition/i)).toHaveValue('');
    });
    expect(within(dialog).getByLabelText(/^z at 15/i)).toHaveValue('');
    expect(within(dialog).getByLabelText(/^source of the z values/i)).toHaveValue('');
  });

  it('rejects dates before 1 January 2000 before contacting the API', async () => {
    const { requests } = pageWith60FDefaults();
    renderApp(`/o/${ORG_A}/flare-sources/${SOURCE_ID}`);
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText(/^date/i), { target: { value: '1999-12-31' } });
    fireEvent.change(within(dialog).getByLabelText(/^total volume/i), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    expect(
      await within(dialog).findByText("Dates before 1 January 2000 can't be recorded"),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });
});

describe('organisation Z defaults in settings', () => {
  it('appear only off the standard condition and need a source', async () => {
    const { requests } = mockApi(
      signedInAs('ORGANISATION_OWNER'),
      on('GET', `/organisations/${ORG_A}/settings`, () => settings),
      on('PATCH', `/organisations/${ORG_A}/settings`, (req) => ({
        status: 200,
        body: { data: req.body },
      })),
    );
    renderApp(`/o/${ORG_A}/settings`);

    await screen.findByRole('textbox', { name: /^temperature/i });
    expect(screen.queryByLabelText(/^z at this condition/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: /^temperature/i }), {
      target: { value: '20' },
    });
    fireEvent.change(await screen.findByLabelText(/^z at this condition/i), {
      target: { value: '0.998' },
    });
    fireEvent.change(screen.getByLabelText(/^z at 15/i), { target: { value: '0.997' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Say where these Z values come from')).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false);

    fireEvent.change(screen.getByLabelText(/^source of the z values/i), {
      target: { value: 'GA-2026-03' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      defaultReferenceTemperature: { value: '20', unit: 'CELSIUS' },
      defaultReferencePressure: { value: '101.325', unit: 'KPA_ABS' },
      defaultCompressibility: { zSource: '0.998', zReference: '0.997', source: 'GA-2026-03' },
    });
  });
});

describe('editing a record saved at an older default condition', () => {
  it('keeps its Z values when the dialog opens', async () => {
    // The organisation default has since moved to 70 °F, but kept the same Z values.
    const movedDefault = {
      status: 200,
      body: {
        data: {
          defaultReferenceTemperature: { value: '70', unit: 'FAHRENHEIT' },
          defaultReferencePressure: { value: '14.73', unit: 'PSIA' },
          defaultCompressibility: { zSource: '0.998', zReference: '0.997', source: 'GA-2026-03' },
        },
      },
    };
    const at60F = record({
      referenceTemperature: { value: '60', unit: 'FAHRENHEIT', entered: '60' },
      referencePressure: { value: '14.73', unit: 'PSIA', entered: '14.73' },
      zSource: { value: '0.998', entered: '0.998' },
      zReference: { value: '0.997', entered: '0.997' },
      compressibilitySource: 'GA-2026-03',
    });
    mockApi(
      signedInAs('DATA_ENTRY_OFFICER'),
      on('GET', `/organisations/${ORG_A}/activity-records/${RECORD_ID}`, () => ({
        status: 200,
        body: { data: at60F },
      })),
      on('GET', `/organisations/${ORG_A}/flare-sources/${SOURCE_ID}`, () => ({
        status: 200,
        body: { data: source },
      })),
      on('GET', /\/assets\/.+$/, () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'x' } },
      })),
      on('GET', `/organisations/${ORG_A}/settings`, () => movedDefault),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    const edit = await screen.findByRole('button', { name: 'Edit' });
    await waitFor(() => {
      expect(edit).toBeEnabled();
    });
    fireEvent.click(edit);
    const dialog = await screen.findByRole('dialog');

    // Give any effects a chance to run, then check nothing was wiped.
    await new Promise((r) => setTimeout(r, 50));
    expect(within(dialog).getByLabelText(/^z at this condition/i)).toHaveValue('0.998');
    expect(within(dialog).getByLabelText(/^z at 15/i)).toHaveValue('0.997');
    expect(within(dialog).getByLabelText(/^source of the z values/i)).toHaveValue('GA-2026-03');
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
});
