import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
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

const unauthenticated = on('GET', '/auth/session', () => ({
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
}));

const signedInAs = (...memberships: ReturnType<typeof membership>[]) =>
  on('GET', '/auth/session', () => ({ status: 200, body: { data: sessionWith(memberships) } }));

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('sign-in', () => {
  it('sends a signed-out visitor to sign in, then on to the page they asked for', async () => {
    const owner = membership(ORG_A, ['ORGANISATION_OWNER']);
    const { requests } = mockApi(
      unauthenticated,
      on('POST', '/auth/login', () => ({ status: 200, body: { data: sessionWith([owner]) } })),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([facility()])),
    );
    const { router } = renderApp(`/o/${ORG_A}/facilities`);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.search).toBe(
      `?next=${encodeURIComponent(`/o/${ORG_A}/facilities`)}`,
    );

    await screen.findByLabelText(/email/i);
    fill(/email/i, 'ada@example.com');
    fill(/password/i, 'correct horse');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('link', { name: 'Okpai Flow Station' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/o/${ORG_A}/facilities`);
    const login = requests.find((r) => r.path === '/auth/login');
    expect(login?.body).toEqual({ email: 'ada@example.com', password: 'correct horse' });
  });

  it('shows one message for a wrong password or unknown email', async () => {
    mockApi(
      unauthenticated,
      on('POST', '/auth/login', () => ({
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' } },
      })),
    );
    renderApp('/login');

    await screen.findByLabelText(/email/i);
    fill(/email/i, 'ada@example.com');
    fill(/password/i, 'wrong');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  });

  it('explains the rate limit', async () => {
    mockApi(
      unauthenticated,
      on('POST', '/auth/login', () => ({
        status: 429,
        body: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts.' } },
      })),
    );
    renderApp('/login');

    await screen.findByLabelText(/email/i);
    fill(/email/i, 'ada@example.com');
    fill(/password/i, 'x');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many sign-in attempts/i);
  });

  it('validates the form before calling the API', async () => {
    const { requests } = mockApi(unauthenticated);
    renderApp('/login');

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/auth/login')).toBe(false);
  });

  it('ignores an off-site ?next= destination', async () => {
    const owner = membership(ORG_A, ['ORGANISATION_OWNER']);
    mockApi(
      signedInAs(owner),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([])),
    );
    const { router } = renderApp('/login?next=//evil.example.com');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/o/${ORG_A}/facilities`);
    });
  });
});

describe('session expiry', () => {
  it('returns to sign-in when the API reports the session has ended', async () => {
    const owner = membership(ORG_A, ['ORGANISATION_OWNER']);
    let sessionValid = true;
    mockApi(
      on('GET', '/auth/session', () =>
        sessionValid
          ? { status: 200, body: { data: sessionWith([owner]) } }
          : { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
      ),
      on('GET', `/organisations/${ORG_A}/facilities`, () => {
        sessionValid = false;
        return { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } };
      }),
    );
    renderApp(`/o/${ORG_A}/facilities`);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(await screen.findByText(/your session has ended/i)).toBeInTheDocument();
  });
});

describe('organisation access', () => {
  it('does not show an organisation the user is not a member of', async () => {
    const { requests } = mockApi(signedInAs(membership(ORG_A, ['VIEWER'])));
    renderApp(`/o/${ORG_B}/facilities`);

    expect(await screen.findByText('Organisation not available')).toBeInTheDocument();
    expect(requests.some((r) => r.path.includes(ORG_B))).toBe(false);
  });

  it('sends "/" to the first organisation', async () => {
    mockApi(
      signedInAs(membership(ORG_A, ['VIEWER']), membership(ORG_B, ['VIEWER'])),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([])),
    );
    const { router } = renderApp('/');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/o/${ORG_A}/facilities`);
    });
  });

  it('explains when the user belongs to no organisation', async () => {
    mockApi(signedInAs());
    renderApp('/');
    expect(await screen.findByText('No organisation access yet')).toBeInTheDocument();
  });

  it('never shows records from the previous organisation after switching', async () => {
    mockApi(
      signedInAs(membership(ORG_A, ['VIEWER']), membership(ORG_B, ['VIEWER'])),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([facility()])),
      on('GET', `/organisations/${ORG_B}/facilities`, () =>
        list([
          facility({
            id: 'f0000000-0000-4000-8000-00000000000b',
            name: 'Escravos Plant',
            organisationId: ORG_B,
          }),
        ]),
      ),
    );
    const { router } = renderApp(`/o/${ORG_A}/facilities`);
    expect(await screen.findByRole('link', { name: 'Okpai Flow Station' })).toBeInTheDocument();

    await router.navigate(`/o/${ORG_B}/facilities`);

    expect(await screen.findByRole('link', { name: 'Escravos Plant' })).toBeInTheDocument();
    expect(screen.queryByText('Okpai Flow Station')).not.toBeInTheDocument();
  });
});

describe('facilities', () => {
  it('hides change actions from roles that cannot make them', async () => {
    mockApi(
      signedInAs(membership(ORG_A, ['VIEWER', 'REVIEWER'])),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/facilities`);

    expect(await screen.findByText('No facilities yet')).toBeInTheDocument();
    expect(screen.getByText(/an organisation owner or administrator can add/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add facility/i })).not.toBeInTheDocument();
  });

  it('sends search and status filters to the server', async () => {
    const { requests } = mockApi(
      signedInAs(membership(ORG_A, ['VIEWER'])),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([facility()])),
    );
    renderApp(`/o/${ORG_A}/facilities?q=okp&status=ALL&page=1`);

    await screen.findByRole('link', { name: 'Okpai Flow Station' });
    const listCall = requests.find((r) => r.path.startsWith(`/organisations/${ORG_A}/facilities?`));
    const params = new URLSearchParams(listCall?.path.split('?')[1]);
    expect(params.get('q')).toBe('okp');
    expect(params.get('status')).toBe('ALL');
    expect(params.get('page')).toBe('1');
  });

  it('creates a facility with the CSRF token and only the API’s fields', async () => {
    const created = facility({
      id: 'f0000000-0000-4000-8000-0000000000c1',
      name: 'Kwale Gas Plant',
      code: 'KWL',
    });
    const { requests } = mockApi(
      signedInAs(membership(ORG_A, ['ADMINISTRATOR'])),
      on('POST', `/organisations/${ORG_A}/facilities`, () => ({
        status: 201,
        body: { data: created },
      })),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/facilities`);

    fireEvent.click((await screen.findAllByRole('button', { name: /add facility/i }))[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^name/i), {
      target: { value: ' Kwale Gas Plant ' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^code/i), { target: { value: 'KWL' } });
    fireEvent.change(within(dialog).getByLabelText(/^latitude/i), {
      target: { value: '5.704321' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add facility' }));

    expect(await screen.findByText('Facility Kwale Gas Plant created.')).toBeInTheDocument();
    const post = requests.find((r) => r.method === 'POST');
    expect(post?.headers['x-csrf-token']).toBe('csrf-123');
    expect(post?.body).toEqual({
      name: 'Kwale Gas Plant',
      code: 'KWL',
      description: null,
      region: null,
      country: 'NG',
      latitude: '5.704321',
      longitude: null,
    });
  });

  it('shows a duplicate code next to the code field', async () => {
    mockApi(
      signedInAs(membership(ORG_A, ['ORGANISATION_OWNER'])),
      on('POST', `/organisations/${ORG_A}/facilities`, () => ({
        status: 409,
        body: { error: { code: 'CONFLICT', message: 'A record with these values already exists' } },
      })),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/facilities`);

    fireEvent.click((await screen.findAllByRole('button', { name: /add facility/i }))[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^name/i), { target: { value: 'Okpai' } });
    fireEvent.change(within(dialog).getByLabelText(/^code/i), { target: { value: 'OKP-FS' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add facility' }));

    expect(
      await within(dialog).findByText(
        'Another facility in this organisation already uses this code',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^code/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('maps API validation errors to their fields', async () => {
    mockApi(
      signedInAs(membership(ORG_A, ['ORGANISATION_OWNER'])),
      on('POST', `/organisations/${ORG_A}/facilities`, () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            details: { formErrors: [], fieldErrors: { region: ['Too long for the API'] } },
          },
        },
      })),
      on('GET', `/organisations/${ORG_A}/facilities`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/facilities`);

    fireEvent.click((await screen.findAllByRole('button', { name: /add facility/i }))[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^name/i), { target: { value: 'Okpai' } });
    fireEvent.change(within(dialog).getByLabelText(/^code/i), { target: { value: 'OKP' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add facility' }));

    expect(await within(dialog).findByText('Too long for the API')).toBeInTheDocument();
  });

  it('sends only changed fields when editing', async () => {
    const f = facility();
    const { requests } = mockApi(
      signedInAs(membership(ORG_A, ['ORGANISATION_OWNER'])),
      on('GET', `/organisations/${ORG_A}/facilities/${f.id}`, () => ({
        status: 200,
        body: { data: f },
      })),
      on('GET', `/organisations/${ORG_A}/assets`, () => list([])),
      on('PATCH', `/organisations/${ORG_A}/facilities/${f.id}`, () => ({
        status: 200,
        body: { data: { ...f, region: 'Bayelsa' } },
      })),
    );
    renderApp(`/o/${ORG_A}/facilities/${f.id}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/^region/i), { target: { value: 'Bayelsa' } });
    fireEvent.click(save);

    await screen.findByText('Saved changes to Okpai Flow Station.');
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ region: 'Bayelsa' });
  });

  it('shows why a facility with active assets cannot be archived', async () => {
    const f = facility();
    mockApi(
      signedInAs(membership(ORG_A, ['ORGANISATION_OWNER'])),
      on('GET', `/organisations/${ORG_A}/facilities/${f.id}`, () => ({
        status: 200,
        body: { data: f },
      })),
      on('GET', `/organisations/${ORG_A}/assets`, () => list([])),
      on('POST', `/organisations/${ORG_A}/facilities/${f.id}/archive`, () => ({
        status: 409,
        body: {
          error: { code: 'CONFLICT', message: 'Archive the facility’s active assets first' },
        },
      })),
    );
    renderApp(`/o/${ORG_A}/facilities/${f.id}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive facility' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Archive the facility’s active assets first',
    );
  });

  it('shows an archived facility as read-only', async () => {
    const f = facility({ status: 'ARCHIVED', archivedAt: '2026-11-10T12:00:00.000Z' });
    mockApi(
      signedInAs(membership(ORG_A, ['ORGANISATION_OWNER'])),
      on('GET', `/organisations/${ORG_A}/facilities/${f.id}`, () => ({
        status: 200,
        body: { data: f },
      })),
      on('GET', `/organisations/${ORG_A}/assets`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/facilities/${f.id}`);

    expect(await screen.findByText(/this facility was archived/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add asset/i })).not.toBeInTheDocument();
  });

  it('treats a record from another organisation as not found', async () => {
    const id = 'f0000000-0000-4000-8000-0000000000ff';
    mockApi(
      signedInAs(membership(ORG_A, ['VIEWER'])),
      on('GET', `/organisations/${ORG_A}/facilities/${id}`, () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Facility not found' } },
      })),
      on('GET', `/organisations/${ORG_A}/assets`, () => list([])),
    );
    renderApp(`/o/${ORG_A}/facilities/${id}`);

    expect(await screen.findByText('Facility not found')).toBeInTheDocument();
  });
});
