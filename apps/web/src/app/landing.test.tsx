import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
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

const signedOut = on('GET', '/auth/session', () => ({
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
}));

describe('the landing page', () => {
  it('is public: a signed-out visitor sees it with sign-in and contact actions', async () => {
    mockApi(signedOut);
    renderApp('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: /every flare reading/i }),
    ).toBeInTheDocument();
    const signIn = screen.getAllByRole('link', { name: /sign in/i });
    expect(signIn[0]).toHaveAttribute('href', '/login');
    expect(screen.getAllByRole('link', { name: /talk to us/i })[0]).toHaveAttribute(
      'href',
      'mailto:bahoodade33@gmail.com?subject=Flame',
    );
    expect(screen.queryByRole('link', { name: /^open/i })).not.toBeInTheDocument();
  });

  it('labels the example panel as illustrative, not operational data', async () => {
    mockApi(signedOut);
    renderApp('/');
    const panel = await screen.findByRole('figure');
    // The visible badge and the screen-reader caption both say so.
    expect(within(panel).getAllByText(/illustrative example/i).length).toBeGreaterThan(0);
    expect(panel).toHaveAccessibleName(/not operational data/i);
  });

  it('marks what is available today and what is not yet built', async () => {
    mockApi(signedOut);
    renderApp('/');
    const workflow = await screen.findByRole('region', { name: /from flare source to reported/i });
    expect(within(workflow).getAllByText('Available')).toHaveLength(3);
    expect(within(workflow).getByText('Next')).toBeInTheDocument();
    expect(within(workflow).getAllByText('Planned')).toHaveLength(2);
    // Integrity statements about credits are explicit.
    expect(
      screen.getByText(/calculating tco2e does not create or issue carbon credits/i),
    ).toBeInTheDocument();
  });

  it('gives a signed-in visitor a way into their organisation and an account menu', async () => {
    mockApi(
      on('GET', '/auth/session', () => ({
        status: 200,
        body: { data: sessionWith([membership(ORG_A, ['VIEWER'])]) },
      })),
    );
    renderApp('/');

    // Header, hero and closing section all lead into the organisation instead.
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /open delta energy/i })).toHaveLength(3);
    });
    for (const link of screen.getAllByRole('link', { name: /open delta energy/i })) {
      expect(link).toHaveAttribute('href', '/app');
    }
    expect(screen.getByRole('button', { name: /account: ada obi/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('renders straight away while the session is still being checked', async () => {
    mockApi(on('GET', '/auth/session', () => PENDING));
    renderApp('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: /every flare reading/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/checking your session/i)).toBeInTheDocument();
  });

  it('lands in the organisation after signing in from it, not back on the landing page', async () => {
    mockApi(
      signedOut,
      on('POST', '/auth/login', () => ({
        status: 200,
        body: { data: sessionWith([membership(ORG_A, ['VIEWER'])]) },
      })),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([])),
    );
    const { router } = renderApp('/');

    fireEvent.click((await screen.findAllByRole('link', { name: /sign in/i }))[0]!);
    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/o/${ORG_A}/facilities`);
    });
  });
});
