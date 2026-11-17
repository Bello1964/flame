import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { sessionQueryKey } from '@/features/auth/session';
import {
  ADA,
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

const TOKEN = 'rst_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const NEW_PASSWORD = 'A-brand-new-password-42';

const signedOut = on('GET', '/auth/session', () => ({
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } },
}));
const signedIn = on('GET', '/auth/session', () => ({
  status: 200,
  body: { data: sessionWith([membership(ORG_A, ['VIEWER'])]) },
}));

/** Public pages enable their submit button once the session check has finished. */
async function readyButton(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  return button;
}

const validation = (fieldErrors: Record<string, string[]>) => ({
  status: 400,
  body: {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: { formErrors: [], fieldErrors },
    },
  },
});

describe('forgot password', () => {
  it('is linked from sign-in', async () => {
    mockApi(signedOut);
    renderApp('/login');
    expect(await screen.findByRole('link', { name: 'Forgot your password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('asks for a link and gives the same neutral answer for any email', async () => {
    const { requests } = mockApi(
      signedOut,
      on('POST', '/auth/password-reset/request', () => ({
        status: 202,
        body: { data: { accepted: true } },
      })),
    );
    renderApp('/forgot-password');

    fireEvent.click(await readyButton('Send reset link'));
    expect(await screen.findByText('Enter your email address')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    const heading = await screen.findByRole('heading', { name: 'Check your email' });
    // The new screen's heading takes focus, so it is announced and focus is not lost.
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(screen.getByText(/belongs to an account that can sign in/)).toBeInTheDocument();
    expect(screen.getByText(/expires after 15 minutes/)).toBeInTheDocument();
    const sent = requests.find((r) => r.path === '/auth/password-reset/request');
    expect(sent?.body).toEqual({ email: 'ada@example.com' });
  });

  it('explains a rate limit', async () => {
    mockApi(
      signedOut,
      on('POST', '/auth/password-reset/request', () => ({
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: 'Too many attempts.' } },
      })),
    );
    renderApp('/forgot-password');
    await readyButton('Send reset link');
    fireEvent.change(screen.getByLabelText(/^Email/), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many reset requests');
  });
});

describe('reset password', () => {
  function fill(password: string, confirm = password) {
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: password } });
    fireEvent.change(screen.getByLabelText(/^Confirm new password/), {
      target: { value: confirm },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
  }

  it('sets a new password with the token in the body, then offers sign-in', async () => {
    const { requests } = mockApi(
      signedOut,
      on('POST', '/auth/password-reset/complete', () => ({ status: 204 })),
    );
    renderApp(`/reset-password/${TOKEN}`);
    await readyButton('Set new password');

    fill('short');
    expect(
      await screen.findByText('Choose a password of at least 12 characters'),
    ).toBeInTheDocument();
    fill(NEW_PASSWORD, 'something-else-entirely');
    expect(await screen.findByText('The passwords don’t match')).toBeInTheDocument();

    fill(NEW_PASSWORD);
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    const sent = requests.find((r) => r.path === '/auth/password-reset/complete');
    expect(sent?.body).toEqual({ token: TOKEN, password: NEW_PASSWORD });
  });

  it('explains an invalid or expired link and offers a new one', async () => {
    mockApi(
      signedOut,
      on('POST', '/auth/password-reset/complete', () => ({
        status: 400,
        body: { error: { code: 'PASSWORD_RESET_INVALID', message: 'Not valid' } },
      })),
    );
    renderApp(`/reset-password/${TOKEN}`);
    await readyButton('Set new password');
    fill(NEW_PASSWORD);
    expect(
      await screen.findByRole('heading', { name: 'This reset link isn’t valid any more' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('shows a server field error on the password', async () => {
    mockApi(
      signedOut,
      on('POST', '/auth/password-reset/complete', () =>
        validation({ password: ['Choose a password different from your current one'] }),
      ),
    );
    renderApp(`/reset-password/${TOKEN}`);
    await readyButton('Set new password');
    fill(NEW_PASSWORD);
    expect(
      await screen.findByText('Choose a password different from your current one'),
    ).toBeInTheDocument();
  });
});

describe('the account page', () => {
  it('is reached from the account menu', async () => {
    mockApi(
      signedIn,
      on('GET', /\/organisations\/.*\/facilities/, () => PENDING),
    );
    const { router } = renderApp(`/o/${ORG_A}/facilities`);
    const [menu] = await screen.findAllByRole('button', { name: `Account: ${ADA.name}` });
    fireEvent.pointerDown(menu!, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Your account' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/account');
    });
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();
  });

  it('saves the name and updates the session', async () => {
    const { requests } = mockApi(
      signedIn,
      on('PATCH', '/account', () => ({
        status: 200,
        body: { data: { ...ADA, name: 'Ada Lovelace' } },
      })),
    );
    const { queryClient } = renderApp('/account');
    const name = await screen.findByLabelText(/^Name/);
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByText('Name saved.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ name: 'Ada Lovelace' });
    expect(requests.find((r) => r.method === 'PATCH')?.headers['x-csrf-token']).toBe('csrf-123');
    const session = queryClient.getQueryData<{ user: { name: string } }>(sessionQueryKey);
    expect(session?.user.name).toBe('Ada Lovelace');
  });

  it('changes the password and maps a wrong current password to its field', async () => {
    let attempt = 0;
    const { requests } = mockApi(
      signedIn,
      on('POST', '/account/password', () => {
        attempt += 1;
        return attempt === 1
          ? validation({ currentPassword: ['The current password is incorrect'] })
          : { status: 204 };
      }),
    );
    renderApp('/account');
    await screen.findByRole('heading', { name: 'Change password' });

    const fill = () => {
      fireEvent.change(screen.getByLabelText(/^Current password/), {
        target: { value: 'old-password' },
      });
      fireEvent.change(screen.getByLabelText(/^New password/), {
        target: { value: NEW_PASSWORD },
      });
      fireEvent.change(screen.getByLabelText(/^Confirm new password/), {
        target: { value: NEW_PASSWORD },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    };

    fill();
    expect(await screen.findByText('The current password is incorrect')).toBeInTheDocument();
    fill();
    expect(
      await screen.findByText('Password changed. Your other devices were signed out.'),
    ).toBeInTheDocument();
    expect(requests.filter((r) => r.path === '/account/password').at(-1)?.body).toEqual({
      currentPassword: 'old-password',
      newPassword: NEW_PASSWORD,
    });
    // The form is cleared after a change.
    await waitFor(() => {
      expect(screen.getByLabelText(/^Current password/)).toHaveValue('');
    });
  });

  it('refuses a new password equal to the current one before sending', async () => {
    const { requests } = mockApi(signedIn);
    renderApp('/account');
    await screen.findByRole('heading', { name: 'Change password' });
    for (const label of [/^Current password/, /^New password/, /^Confirm new password/]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: NEW_PASSWORD } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(
      await screen.findByText('Choose a password different from your current one'),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/account/password')).toBe(false);
  });
});
