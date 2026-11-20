import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ActivityRecordDto, ActivityRecordEventDto, Role } from '@flame/shared';
import { list, membership, mockApi, on, ORG_A, renderApp, sessionWith } from '@/test/render-app';
import { RECORD_ID, SOURCE_ID, record, source } from '@/test/activity-fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

const RECORDS = `/organisations/${ORG_A}/activity-records`;
const REVISION_ID = 'd0000000-0000-4000-8000-000000000002';
const OTHER_ID = 'd0000000-0000-4000-8000-000000000003';

function signedInAs(...roles: Role[]) {
  return on('GET', '/auth/session', () => ({
    status: 200,
    body: { data: sessionWith([membership(ORG_A, roles)]) },
  }));
}

function event(overrides: Partial<ActivityRecordEventDto>): ActivityRecordEventDto {
  return {
    id: 'e1',
    type: 'CREATED',
    fromStatus: null,
    toStatus: 'DRAFT',
    actor: { id: 'user-2', name: 'Bayo Lawal' },
    comment: null,
    warnings: null,
    relatedRecordId: null,
    createdAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  };
}

/** The record page for `r`, its hierarchy and history, plus any extra handlers. */
function recordPage(
  roles: Role[],
  r: ActivityRecordDto,
  events: ActivityRecordEventDto[] = [event({})],
  ...extra: Parameters<typeof mockApi>
) {
  return mockApi(
    signedInAs(...roles),
    ...extra,
    on('GET', `${RECORDS}/${r.id}/history`, () => ({ status: 200, body: { data: events } })),
    on('GET', `${RECORDS}/${r.id}`, () => ({ status: 200, body: { data: r } })),
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
}

describe('workflow actions on a record page', () => {
  it('offers only the actions the API lists, and submits after confirming', async () => {
    const { requests } = recordPage(
      ['DATA_ENTRY_OFFICER'],
      record(),
      [event({})],
      on('POST', `${RECORDS}/${RECORD_ID}/submit`, () => ({
        status: 200,
        body: {
          data: record({ status: 'SUBMITTED', availableActions: ['recall'] }),
        },
      })),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Submit for review' }));
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/can’t be edited while it is reviewed/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/note for the reviewer/i), {
      target: { value: 'Meter recalibrated' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit for review' }));

    expect(await screen.findByText('Submitted for review.')).toBeInTheDocument();
    expect(requests.find((r) => r.path.endsWith('/submit'))?.body).toEqual({
      comment: 'Meter recalibrated',
    });
  });

  it('requires a reason before returning a record for correction', async () => {
    const { requests } = recordPage(
      ['REVIEWER'],
      record({
        status: 'UNDER_REVIEW',
        claim: { byId: 'user-1', byName: 'Ada Obi', at: '2026-11-15T11:00:00.000Z' },
        availableActions: ['release-claim', 'forward', 'return'],
      }),
      [event({})],
      on('POST', `${RECORDS}/${RECORD_ID}/return`, () => ({
        status: 200,
        body: { data: record({ status: 'NEEDS_CORRECTION', availableActions: [] }) },
      })),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    expect(await screen.findByText(/Being reviewed by Ada Obi/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Return for correction' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Return for correction' }));
    expect(await within(dialog).findByText('Give a reason')).toBeInTheDocument();
    expect(requests.some((r) => r.path.endsWith('/return'))).toBe(false);

    fireEvent.change(within(dialog).getByLabelText(/what needs correcting/i), {
      target: { value: 'Rate too high' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Return for correction' }));
    expect(await screen.findByText('Returned for correction.')).toBeInTheDocument();
    expect(requests.find((r) => r.path.endsWith('/return'))?.body).toEqual({
      comment: 'Rate too high',
    });
  });

  it('lists the records that block a submission', async () => {
    recordPage(
      ['DATA_ENTRY_OFFICER'],
      record(),
      [event({})],
      on('POST', `${RECORDS}/${RECORD_ID}/submit`, () => ({
        status: 409,
        body: {
          error: {
            code: 'OVERLAP_BLOCKED',
            message: 'This record overlaps 1 submitted or approved record.',
            details: {
              overlapping: [{ id: OTHER_ID, periodStart: '2026-01-10', periodEnd: '2026-01-10' }],
            },
          },
        },
      })),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Submit for review' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit for review' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/overlaps 1 submitted or approved record/);
    expect(within(alert).getByRole('link', { name: '10 Jan 2026' })).toHaveAttribute(
      'href',
      `/o/${ORG_A}/activity-records/${OTHER_ID}`,
    );
  });

  it('explains why someone may not review a record they worked on', async () => {
    recordPage(
      ['DATA_ENTRY_OFFICER', 'REVIEWER'],
      record({
        status: 'SUBMITTED',
        availableActions: ['recall'],
        separationOfDuties:
          'You entered, edited or submitted this record, so someone else must review and approve it',
      }),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    expect(await screen.findByText(/someone else must review and approve it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recall to draft' })).toBeInTheDocument();
  });

  it('shows why a record was returned, and the history with comments', async () => {
    recordPage(['DATA_ENTRY_OFFICER'], record({ status: 'NEEDS_CORRECTION' }), [
      event({ id: 'e1' }),
      event({ id: 'e2', type: 'SUBMITTED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }),
      event({
        id: 'e3',
        type: 'RETURNED',
        fromStatus: 'UNDER_REVIEW',
        toStatus: 'NEEDS_CORRECTION',
        actor: { id: 'user-3', name: 'Chidi Eze' },
        comment: 'Wrong flare source',
      }),
    ]);
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    expect(await screen.findByText(/“Wrong flare source” — Chidi Eze/)).toBeInTheDocument();
    const history = await screen.findByRole('list', { name: 'Record history' });
    expect(within(history).getByText('Returned for correction')).toBeInTheDocument();
    expect(within(history).getByText('Wrong flare source')).toBeInTheDocument();
    expect(within(history).getByText('by Chidi Eze')).toBeInTheDocument();
  });

  it('starts a revision of an approved record and opens it', async () => {
    const revision = record({ id: REVISION_ID, version: 2, revisionOfId: RECORD_ID });
    const { requests } = recordPage(
      ['DATA_ENTRY_OFFICER'],
      record({
        status: 'APPROVED',
        approval: { at: '2026-11-15T12:00:00.000Z', byId: 'user-4', byName: 'Dayo Ade' },
        availableActions: ['revise'],
      }),
      [event({})],
      on('POST', `${RECORDS}/${RECORD_ID}/revise`, () => ({
        status: 201,
        body: { data: revision },
      })),
      on('GET', `${RECORDS}/${REVISION_ID}/history`, () => ({ status: 200, body: { data: [] } })),
      on('GET', `${RECORDS}/${REVISION_ID}`, () => ({ status: 200, body: { data: revision } })),
    );
    renderApp(`/o/${ORG_A}/activity-records/${RECORD_ID}`);

    expect(await screen.findByText(/Approved by Dayo Ade/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revise' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/stays approved, and in use/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revise' }));

    expect(
      await screen.findByText(/Version 2: a revision of an approved record/),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST' && r.path.endsWith('/revise'))).toBe(true);
  });
});

describe('the review page', () => {
  function reviewApi(
    roles: Role[],
    submitted: ActivityRecordDto[],
    ...extra: Parameters<typeof mockApi>
  ) {
    return mockApi(
      signedInAs(...roles),
      ...extra,
      on('GET', RECORDS, (req) => {
        if (req.path.includes('status=SUBMITTED')) return list(submitted);
        return list([]);
      }),
    );
  }

  it('shows reviewers their queues but not approval, and no review link to viewers', async () => {
    reviewApi(['REVIEWER'], [record({ status: 'SUBMITTED', availableActions: ['start-review'] })]);
    renderApp(`/o/${ORG_A}/review`);

    const tabs = await screen.findByRole('tablist', { name: 'Review queues' });
    expect(within(tabs).getByRole('tab', { name: /To review/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(tabs).getByRole('tab', { name: /My reviews/ })).toBeInTheDocument();
    expect(within(tabs).queryByRole('tab', { name: /Awaiting approval/ })).not.toBeInTheDocument();
    expect(await screen.findByText('HP Flare Stack')).toBeInTheDocument();
    // The link's name carries the waiting count when there is one, counting only the
    // queues this reviewer sees: never the approval queue.
    expect(
      screen.getByRole('link', { name: /^Review(, \d+ records? waiting for review)?$/ }),
    ).toBeInTheDocument();
  });

  it('tells other roles the queues are not for them', async () => {
    reviewApi(['VIEWER'], []);
    renderApp(`/o/${ORG_A}/review`);
    expect(
      await screen.findByText('Review queues are for reviewers and approvers'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Review\b/ })).not.toBeInTheDocument();
  });

  it('starts reviews in bulk and reports records that could not be claimed', async () => {
    const a = record({ status: 'SUBMITTED', availableActions: ['start-review'] });
    const b = record({
      id: OTHER_ID,
      status: 'SUBMITTED',
      periodStart: '2026-01-11',
      periodEnd: '2026-01-11',
      availableActions: ['start-review'],
    });
    const { requests } = reviewApi(
      ['REVIEWER'],
      [a, b],
      on('POST', `${RECORDS}/bulk`, () => ({
        status: 200,
        body: {
          data: [
            { id: RECORD_ID, ok: true, status: 'UNDER_REVIEW' },
            {
              id: OTHER_ID,
              ok: false,
              error: { code: 'CONFLICT', message: 'This record is under review' },
            },
          ],
        },
      })),
    );
    renderApp(`/o/${ORG_A}/review`);

    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: 'Select all records on this page that you can act on',
      }),
    );
    const bar = screen.getByRole('region', { name: 'Actions for selected records' });
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(within(bar).getByRole('button', { name: 'Start review' }));

    expect(await screen.findByText('Start review: 1 record done.')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('11 Jan 2026: This record is under review');
    await waitFor(() => {
      expect(requests.find((r) => r.path.endsWith('/bulk'))?.body).toEqual({
        action: 'start-review',
        ids: [RECORD_ID, OTHER_ID],
      });
    });
  });
});
