import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
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
import { RouteErrorPage } from './route-error-page';

afterEach(() => {
  vi.unstubAllGlobals();
});

const owner = membership(ORG_A, ['ORGANISATION_OWNER']);
const signedIn = on('GET', '/auth/session', () => ({
  status: 200,
  body: { data: sessionWith([owner]) },
}));

function asset(overrides: Partial<AssetDto> = {}): AssetDto {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    organisationId: ORG_A,
    facilityId: facility().id,
    name: 'Separator A',
    code: 'SEP-A',
    assetType: 'Separator',
    description: null,
    status: 'ACTIVE',
    archivedAt: null,
    createdById: 'user-1',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('first paint', () => {
  it('shows the app shell outline while the session is being checked', async () => {
    mockApi(on('GET', '/auth/session', () => PENDING));
    renderApp(`/o/${ORG_A}/facilities`);

    expect(await screen.findByRole('status', { name: /loading flame/i })).toBeInTheDocument();
    expect(screen.getAllByText('Flame').length).toBeGreaterThan(0);
  });

  it('shows the sign-in form immediately, without waiting for the session check', async () => {
    mockApi(on('GET', '/auth/session', () => PENDING));
    renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(await screen.findByLabelText(/email/i)).toBeEnabled();
  });

  it('shows a table-shaped placeholder while a list loads', async () => {
    mockApi(
      signedIn,
      on('GET', `/organisations/${ORG_A}/facilities`, () => PENDING),
    );
    renderApp(`/o/${ORG_A}/facilities`);

    expect(await screen.findByRole('status', { name: /loading facilities/i })).toBeInTheDocument();
  });

  it('shows a record-shaped placeholder while a record loads', async () => {
    const f = facility();
    mockApi(
      signedIn,
      on('GET', `/organisations/${ORG_A}/facilities/${f.id}`, () => PENDING),
    );
    renderApp(`/o/${ORG_A}/facilities/${f.id}`);

    expect(await screen.findByRole('status', { name: /loading facility/i })).toBeInTheDocument();
  });

  it('shows a placeholder, not "Not recorded", while a parent name loads', async () => {
    const a = asset();
    mockApi(
      signedIn,
      on('GET', `/organisations/${ORG_A}/assets/${a.id}`, () => ({
        status: 200,
        body: { data: a },
      })),
      on('GET', `/organisations/${ORG_A}/facilities/${a.facilityId}`, () => PENDING),
      on('GET', `/organisations/${ORG_A}/flare-sources`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/assets/${a.id}`);

    expect(await screen.findByRole('heading', { name: 'Separator A' })).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByText('Loading')).toBeInTheDocument();
    // The Facility field is loading, not missing.
    const facilityValue = screen.getByText('Facility', { selector: 'dt' }).nextElementSibling;
    expect(facilityValue).toHaveTextContent('Loading');
    expect(facilityValue).not.toHaveTextContent('Not recorded');
  });
});

describe('preloaded data', () => {
  it('opens a record from a list instantly, without fetching it again', async () => {
    const f = facility();
    const { requests } = mockApi(
      signedIn,
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([f])),
      on('GET', `/organisations/${ORG_A}/assets`, () => list([])),
      on('GET', `/organisations/${ORG_A}/facilities/${f.id}`, () => ({
        status: 200,
        body: { data: f },
      })),
    );
    renderApp(`/o/${ORG_A}/facilities`);

    fireEvent.click(await screen.findByRole('link', { name: f.name }));

    expect(await screen.findByRole('heading', { name: f.name })).toBeInTheDocument();
    expect(requests.some((r) => r.path === `/organisations/${ORG_A}/facilities/${f.id}`)).toBe(
      false,
    );
  });

  it('fetches a record’s child list on hover, and the page reuses it', async () => {
    const f = facility();
    const { requests } = mockApi(
      signedIn,
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([f])),
      on('GET', `/organisations/${ORG_A}/assets`, () => list([asset()])),
    );
    renderApp(`/o/${ORG_A}/facilities`);

    const link = await screen.findByRole('link', { name: f.name });
    fireEvent.mouseEnter(link);

    const assetCalls = () =>
      requests.filter((r) => r.path.startsWith(`/organisations/${ORG_A}/assets?`));
    await waitFor(() => {
      expect(assetCalls()).toHaveLength(1);
    });
    expect(new URLSearchParams(assetCalls()[0]?.path.split('?')[1]).get('facilityId')).toBe(f.id);

    fireEvent.click(link);
    expect(await screen.findByRole('link', { name: 'Separator A' })).toBeInTheDocument();
    // The prefetched first page is fresh, so opening the page does not request it again.
    expect(assetCalls()).toHaveLength(1);
  });
});

describe('page code that fails to load', () => {
  it('offers a reload instead of a blank screen', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          errorElement: <RouteErrorPage />,
          lazy: () =>
            Promise.reject(new TypeError('Failed to fetch dynamically imported module: /page.js')),
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('This page could not be loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });
});
