import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { sessionQueryKey } from '@/features/auth/session';
import {
  ADA,
  BAYO,
  facility,
  list,
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

/**
 * The session cookie is shared by every tab. These tests change who the cookie belongs
 * to "in another tab" (the mocked API starts answering as someone else), then trigger the
 * session refetch that a window focus would cause.
 */
describe('identity changes in another tab', () => {
  it('drops the previous user’s data when someone else signs in', async () => {
    let user = ADA;
    const { requests } = mockApi(
      on('GET', '/auth/session', () => ({
        status: 200,
        body: { data: sessionWith([membership(ORG_A, ['VIEWER'])], user) },
      })),
      on('GET', `/organisations/${ORG_A}/facilities`, () =>
        user === ADA
          ? list([facility({ name: 'Ada’s Facility' })])
          : list([
              facility({ id: 'f0000000-0000-4000-8000-0000000000b2', name: 'Bayo’s Facility' }),
            ]),
      ),
    );
    const { queryClient } = renderApp(`/o/${ORG_A}/facilities`);
    expect(await screen.findByRole('link', { name: 'Ada’s Facility' })).toBeInTheDocument();

    user = BAYO;
    await act(() => queryClient.invalidateQueries({ queryKey: sessionQueryKey }));

    expect(await screen.findByText(/now signed in as Bayo Lawal/i)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Bayo’s Facility' })).toBeInTheDocument();
    expect(screen.queryByText('Ada’s Facility')).not.toBeInTheDocument();
    // Ada's cached record is gone, not just hidden.
    expect(
      queryClient.getQueryData(['org', ORG_A, 'facilities', 'detail', facility().id]),
    ).toBeUndefined();
    const listCalls = requests.filter((r) =>
      r.path.startsWith(`/organisations/${ORG_A}/facilities?`),
    );
    expect(listCalls).toHaveLength(2);
  });

  it('keeps cached data when the same user’s session is refreshed', async () => {
    const { requests } = mockApi(
      on('GET', '/auth/session', () => ({
        status: 200,
        body: { data: sessionWith([membership(ORG_A, ['VIEWER'])]) },
      })),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([facility()])),
    );
    const { queryClient } = renderApp(`/o/${ORG_A}/facilities`);
    await screen.findByRole('link', { name: 'Okpai Flow Station' });

    await act(() => queryClient.invalidateQueries({ queryKey: sessionQueryKey }));

    expect(screen.getByRole('link', { name: 'Okpai Flow Station' })).toBeInTheDocument();
    expect(requests.filter((r) => r.path.includes('/facilities?'))).toHaveLength(1);
  });

  it('returns to sign-in and clears data when signed out elsewhere', async () => {
    let signedIn = true;
    mockApi(
      on('GET', '/auth/session', () =>
        signedIn
          ? { status: 200, body: { data: sessionWith([membership(ORG_A, ['VIEWER'])]) } }
          : { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
      ),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([facility()])),
    );
    const { queryClient } = renderApp(`/o/${ORG_A}/facilities`);
    await screen.findByRole('link', { name: 'Okpai Flow Station' });

    signedIn = false;
    await act(() => queryClient.invalidateQueries({ queryKey: sessionQueryKey }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(await screen.findByText(/your session has ended/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(queryClient.getQueryCache().findAll({ queryKey: ['org'] })).toHaveLength(0);
    });
  });
});
