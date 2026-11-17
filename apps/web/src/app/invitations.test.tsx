import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { InvitationLookupDto, SessionResponse } from '@flame/shared';
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
  ORG_B,
  renderApp,
  sessionWith,
} from '@/test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const PATH = `/invite/${TOKEN}`;

function lookup(overrides: Partial<InvitationLookupDto> = {}): InvitationLookupDto {
  return {
    kind: 'ORGANISATION',
    organisationId: ORG_A,
    organisationName: 'Delta Energy',
    inviterName: 'Chika Eze',
    email: BAYO.email,
    roles: ['REVIEWER', 'VIEWER'],
    expiresAt: '2026-11-20T09:00:00.000Z',
    status: 'PENDING',
    accountExists: false,
    ...overrides,
  };
}

const signedOut = on('GET', '/auth/session', () => ({
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } },
}));

function signedInAs(user: SessionResponse['user'], memberships = [membership(ORG_B, ['VIEWER'])]) {
  return on('GET', '/auth/session', () => ({
    status: 200,
    body: { data: sessionWith(memberships, user) },
  }));
}

const found = (data: InvitationLookupDto) =>
  on('POST', '/invitations/lookup', () => ({ status: 200, body: { data } }));

describe('the invitation page', () => {
  it('creates an account, signs in and opens the organisation', async () => {
    const joined = sessionWith([membership(ORG_A, ['REVIEWER', 'VIEWER'])], BAYO);
    const { requests } = mockApi(
      signedOut,
      found(lookup()),
      on('POST', '/invitations/accept', () => ({ status: 200, body: { data: joined } })),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([facility()])),
    );
    const { router, queryClient } = renderApp(PATH);

    expect(
      await screen.findByRole('heading', { name: 'You’re invited to join Delta Energy' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Chika Eze')).toBeInTheDocument();
    expect(screen.getByText('Reviewer, Viewer')).toBeInTheDocument();
    // The token goes in the body, never in the API URL.
    const lookupRequest = requests.find((r) => r.path === '/invitations/lookup');
    expect(lookupRequest?.body).toEqual({ token: TOKEN });

    fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: 'Bayo Lawal' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText(/^Confirm password/), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account and accept' }));
    expect(
      await screen.findByText('Choose a password of at least 12 characters'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: 'a long enough password' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm password/), {
      target: { value: 'a different password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account and accept' }));
    expect(await screen.findByText('The passwords don’t match')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Confirm password/), {
      target: { value: 'a long enough password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account and accept' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/o/${ORG_A}/facilities`);
    });
    expect(requests.find((r) => r.path === '/invitations/accept')?.body).toEqual({
      token: TOKEN,
      name: 'Bayo Lawal',
      password: 'a long enough password',
    });
    expect(queryClient.getQueryData(sessionQueryKey)).toEqual(joined);
    expect(await screen.findByText('Welcome to Delta Energy.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Okpai Flow Station' })).toBeInTheDocument();
  });

  it('shows the server’s field errors when creating the account', async () => {
    mockApi(
      signedOut,
      found(lookup()),
      on('POST', '/invitations/accept', () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            details: { formErrors: [], fieldErrors: { name: ['Enter your name'] } },
          },
        },
      })),
    );
    renderApp(PATH);
    fireEvent.change(await screen.findByLabelText(/^Your name/), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'a long password!' } });
    fireEvent.change(screen.getByLabelText(/^Confirm password/), {
      target: { value: 'a long password!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account and accept' }));
    expect(await screen.findByText('Enter your name')).toBeInTheDocument();
  });

  it('accepts with an existing account’s password, in one step', async () => {
    let attempts = 0;
    const joined = sessionWith(
      [membership(ORG_B, ['VIEWER']), membership(ORG_A, ['REVIEWER', 'VIEWER'])],
      BAYO,
    );
    const { requests } = mockApi(
      signedOut,
      found(lookup({ accountExists: true })),
      on('POST', '/invitations/accept', () => {
        attempts += 1;
        return attempts === 1
          ? {
              status: 401,
              body: { error: { code: 'UNAUTHENTICATED', message: 'Incorrect password' } },
            }
          : { status: 200, body: { data: joined } };
      }),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([facility()])),
    );
    const { router } = renderApp(PATH);

    expect(await screen.findByText(/An account already exists for bayo@example.com/)).toBeVisible();
    expect(screen.queryByLabelText(/^Your name/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'sign in normally' })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(PATH)}`,
    );

    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in and accept' }));
    expect(await screen.findByText('Incorrect password for this account.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'right one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in and accept' }));
    // Into the organisation just joined, not the first one in the list.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/o/${ORG_A}/facilities`);
    });
    expect(requests.filter((r) => r.path === '/invitations/accept').at(-1)?.body).toEqual({
      token: TOKEN,
      password: 'right one',
    });
  });

  it('accepts for the signed-in account with its security token', async () => {
    const joined = sessionWith(
      [membership(ORG_B, ['VIEWER']), membership(ORG_A, ['REVIEWER', 'VIEWER'])],
      BAYO,
    );
    const { requests } = mockApi(
      signedInAs(BAYO),
      found(lookup({ accountExists: true })),
      on('POST', '/invitations/accept', () => ({ status: 200, body: { data: joined } })),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([facility()])),
    );
    const { router } = renderApp(PATH);
    expect(await screen.findByText('You’re signed in as bayo@example.com.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/o/${ORG_A}/facilities`);
    });
    const accept = requests.find((r) => r.path === '/invitations/accept');
    expect(accept?.body).toEqual({ token: TOKEN });
    expect(accept?.headers['x-csrf-token']).toBe('csrf-123');
    // The lookup waited for the session, so it carried the token too.
    expect(requests.find((r) => r.path === '/invitations/lookup')?.headers['x-csrf-token']).toBe(
      'csrf-123',
    );
  });

  it('says the session ended (not a wrong password) when a signed-in accept gets 401', async () => {
    mockApi(
      signedInAs(BAYO),
      found(lookup({ accountExists: true })),
      on('POST', '/invitations/accept', () => ({
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Your session has ended.' } },
      })),
    );
    renderApp(PATH);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    // The app-wide 401 handling ends the session; the page then offers the password form.
    expect(
      await screen.findByText('Your session has ended. Sign in again to continue.'),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText(/^Password/)).toBeInTheDocument();
    expect(screen.queryByText('Incorrect password for this account.')).not.toBeInTheDocument();
  });

  it('explains when a revival invitation is refused because the organisation has an Owner again', async () => {
    mockApi(
      signedInAs(BAYO),
      found(lookup({ accountExists: true, roles: ['ORGANISATION_OWNER'] })),
      on('POST', '/invitations/accept', () => ({
        status: 409,
        body: { error: { code: 'ORGANISATION_NOT_DORMANT', message: 'Not dormant' } },
      })),
    );
    renderApp(PATH);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByText(/has an Owner again/)).toBeInTheDocument();
  });

  it('sends a Platform Administrator invitation to the methodology registry', async () => {
    mockApi(
      signedInAs(BAYO, []),
      found(
        lookup({ kind: 'PLATFORM_ADMIN', organisationId: null, organisationName: null, roles: [] }),
      ),
      on('POST', '/invitations/accept', () => ({
        status: 200,
        body: { data: sessionWith([], { ...BAYO, isPlatformAdmin: true }) },
      })),
      on('GET', '/admin/methodology/editions', () => list([])),
    );
    const { router } = renderApp(PATH);
    expect(
      await screen.findByRole('heading', {
        name: 'You’re invited to become a Platform Administrator',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin/methodology');
    });
  });

  it('explains when signed in as a different account and offers to sign out', async () => {
    let signedIn = true;
    const { requests } = mockApi(
      on('GET', '/auth/session', () =>
        signedIn
          ? { status: 200, body: { data: sessionWith([membership(ORG_B, ['VIEWER'])], ADA) } }
          : { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
      ),
      found(lookup({ accountExists: true })),
      on('POST', '/auth/logout', () => {
        signedIn = false;
        return { status: 204 };
      }),
    );
    renderApp(PATH);
    const note = await screen.findByRole('note', {
      name: 'You’re signed in as a different account',
    });
    expect(note).toHaveTextContent('This invitation is for bayo@example.com');
    expect(note).toHaveTextContent('ada@example.com');
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();

    fireEvent.click(within(note).getByRole('button', { name: 'Sign out of ada@example.com' }));
    // Signed out: the page offers the password step for the invited account.
    expect(await screen.findByRole('button', { name: 'Sign in and accept' })).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/auth/logout')).toBe(true);
  });

  it.each([
    ['EXPIRED', 'This invitation has expired', 'Ask Chika Eze to invite you again'],
    ['REVOKED', 'This invitation was withdrawn', 'Chika Eze revoked it'],
    ['ACCEPTED', 'This invitation has already been used', 'works once'],
    ['DECLINED', 'This invitation was declined', 'ask Chika Eze to invite you again'],
  ] as const)('explains a %s invitation', async (status, title, detail) => {
    mockApi(signedOut, found(lookup({ status })));
    renderApp(PATH);
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(detail))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
  });

  it('explains an unknown link', async () => {
    mockApi(
      signedOut,
      on('POST', '/invitations/lookup', () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'This invitation link is not valid' } },
      })),
    );
    renderApp(PATH);
    expect(await screen.findByText('This invitation link isn’t valid')).toBeInTheDocument();
  });

  it('says when there have been too many attempts', async () => {
    mockApi(
      signedOut,
      on('POST', '/invitations/lookup', () => ({
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } },
      })),
    );
    renderApp(PATH);
    expect(await screen.findByText('Too many attempts')).toBeInTheDocument();
  });

  it('shows the current state when the invitation expired while answering', async () => {
    let expired = false;
    mockApi(
      signedOut,
      on('POST', '/invitations/lookup', () => ({
        status: 200,
        body: { data: lookup({ status: expired ? 'EXPIRED' : 'PENDING' }) },
      })),
      on('POST', '/invitations/accept', () => {
        expired = true;
        return {
          status: 409,
          body: { error: { code: 'INVITATION_EXPIRED', message: 'This invitation has expired' } },
        };
      }),
    );
    renderApp(PATH);
    fireEvent.change(await screen.findByLabelText(/^Your name/), { target: { value: 'Bayo' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'a long password!' } });
    fireEvent.change(screen.getByLabelText(/^Confirm password/), {
      target: { value: 'a long password!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account and accept' }));
    expect(await screen.findByText('This invitation has expired')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Your name/)).not.toBeInTheDocument();
  });

  it('declines without an account', async () => {
    const { requests } = mockApi(
      signedOut,
      found(lookup()),
      on('POST', '/invitations/decline', () => ({
        status: 200,
        body: { data: lookup({ status: 'DECLINED' }) },
      })),
    );
    renderApp(PATH);
    fireEvent.click(await screen.findByRole('button', { name: 'Decline invitation' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Chika Eze will need to invite you again');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline invitation' }));
    expect(await screen.findByText('This invitation was declined')).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/invitations/decline')?.body).toEqual({
      token: TOKEN,
    });
  });
});
