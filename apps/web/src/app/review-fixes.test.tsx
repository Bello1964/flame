import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AssetDto } from '@carbon/shared';
import {
  facility,
  list,
  membership,
  mockApi,
  on,
  ORG_A,
  PENDING,
  renderApp,
  sessionWith,
} from '@/test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

const signedInAsOwner = on('GET', '/auth/session', () => ({
  status: 200,
  body: { data: sessionWith([membership(ORG_A, ['ORGANISATION_OWNER'])]) },
}));

const csrfRejected = () => ({
  status: 403,
  body: { error: { code: 'CSRF_REJECTED', message: 'Request rejected by CSRF protection' } },
});

function asset(overrides: Partial<AssetDto> = {}): AssetDto {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    organisationId: ORG_A,
    facilityId: facility().id,
    name: 'Separator A',
    code: 'SEP-A',
    assetType: null,
    description: null,
    status: 'ACTIVE',
    archivedAt: null,
    createdById: 'user-1',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('CSRF rejection', () => {
  it('tells the user to retry a form, and refreshes the session', async () => {
    const { requests } = mockApi(
      signedInAsOwner,
      on('POST', `/organisations/${ORG_A}/facilities`, csrfRejected),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/facilities`);

    fireEvent.click((await screen.findAllByRole('button', { name: /add facility/i }))[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^name/i), { target: { value: 'Kwale' } });
    fireEvent.change(within(dialog).getByLabelText(/^code/i), { target: { value: 'KWL' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add facility' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /your session was refreshed.*please try again/i,
    );
    await waitFor(() => {
      expect(requests.filter((r) => r.path === '/auth/session')).toHaveLength(2);
    });
  });

  it('does not blame the user’s role when archiving is CSRF-rejected', async () => {
    const f = facility();
    mockApi(
      signedInAsOwner,
      on('GET', `/organisations/${ORG_A}/facilities/${f.id}`, () => ({
        status: 200,
        body: { data: f },
      })),
      on('GET', `/organisations/${ORG_A}/assets`, () => list([])),
      on('POST', `/organisations/${ORG_A}/facilities/${f.id}/archive`, csrfRejected),
    );
    renderApp(`/o/${ORG_A}/facilities/${f.id}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive facility' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/your session was refreshed/i);
    expect(alert).not.toHaveTextContent(/role/i);
  });

  it('still explains a genuine permission refusal when archiving', async () => {
    const f = facility();
    mockApi(
      signedInAsOwner,
      on('GET', `/organisations/${ORG_A}/facilities/${f.id}`, () => ({
        status: 200,
        body: { data: f },
      })),
      on('GET', `/organisations/${ORG_A}/assets`, () => list([])),
      on('POST', `/organisations/${ORG_A}/facilities/${f.id}/archive`, () => ({
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      })),
    );
    renderApp(`/o/${ORG_A}/facilities/${f.id}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive facility' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /your role does not allow archiving/i,
    );
  });
});

describe('malformed record address', () => {
  it('shows "not found" without asking the API', async () => {
    const { requests } = mockApi(
      signedInAsOwner,
      on('GET', `/organisations/${ORG_A}/assets`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/facilities/not-a-real-id`);

    expect(await screen.findByText('Facility not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(requests.some((r) => r.path.includes('not-a-real-id'))).toBe(false);
  });

  it('treats an API validation error on a record as "not found"', async () => {
    const id = 'f0000000-0000-4000-8000-0000000000e1';
    mockApi(
      signedInAsOwner,
      on('GET', `/organisations/${ORG_A}/facilities/${id}`, () => ({
        status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } },
      })),
      on('GET', `/organisations/${ORG_A}/assets`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/facilities/${id}`);

    expect(await screen.findByText('Facility not found')).toBeInTheDocument();
  });
});

describe('moving between records of the same kind', () => {
  it('never shows the previous facility’s assets under the next facility', async () => {
    const a = facility({ id: 'f0000000-0000-4000-8000-0000000000a1', name: 'Facility A' });
    const b = facility({ id: 'f0000000-0000-4000-8000-0000000000b1', name: 'Facility B' });
    mockApi(
      signedInAsOwner,
      on('GET', `/organisations/${ORG_A}/facilities/${a.id}`, () => ({
        status: 200,
        body: { data: a },
      })),
      on('GET', `/organisations/${ORG_A}/facilities/${b.id}`, () => ({
        status: 200,
        body: { data: b },
      })),
      on('GET', `/organisations/${ORG_A}/assets`, (req) =>
        req.path.includes(a.id) ? list([asset({ name: 'Asset of A', facilityId: a.id })]) : PENDING,
      ),
    );
    const { router, queryClient } = renderApp(`/o/${ORG_A}/facilities/${a.id}`);
    expect(await screen.findByRole('link', { name: 'Asset of A' })).toBeInTheDocument();

    // B is already cached (e.g. seen in a list), so the page renders at once and the
    // asset list stays mounted while only its parent filter changes.
    queryClient.setQueryData(['org', ORG_A, 'facilities', 'detail', b.id], b);
    await router.navigate(`/o/${ORG_A}/facilities/${b.id}`);

    expect(await screen.findByRole('heading', { name: 'Facility B' })).toBeInTheDocument();
    expect(await screen.findByRole('status', { name: /loading assets/i })).toBeInTheDocument();
    expect(screen.queryByText('Asset of A')).not.toBeInTheDocument();
  });

  it('still keeps rows visible while paging within the same list', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      facility({
        id: `f0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        name: `Facility ${i + 1}`,
      }),
    );
    mockApi(
      on('GET', '/auth/session', () => ({
        status: 200,
        body: { data: sessionWith([membership(ORG_A, ['VIEWER'])]) },
      })),
      on('GET', `/organisations/${ORG_A}/facilities`, (req) =>
        req.path.includes('page=2')
          ? PENDING
          : { status: 200, body: { data: rows, meta: { page: 1, pageSize: 25, total: 30 } } },
      ),
    );
    renderApp(`/o/${ORG_A}/facilities`);

    fireEvent.click(await screen.findByRole('button', { name: /next/i }));

    expect(await screen.findByText(/updating/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Facility 1' })).toBeInTheDocument();
  });
});
