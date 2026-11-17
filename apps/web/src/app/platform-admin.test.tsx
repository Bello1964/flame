import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  DevMailboxEmailDto,
  InvitationDto,
  PlatformAdminDto,
  PlatformAdminsDto,
  PlatformOrganisationDto,
} from '@flame/shared';
import { ADA, mockApi, on, ORG_A, ORG_B, renderApp, sessionWith } from '@/test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ADMIN = { ...ADA, isPlatformAdmin: true };
const signedInAsAdmin = on('GET', '/auth/session', () => ({
  status: 200,
  body: { data: sessionWith([], ADMIN) },
}));

function ownerInvitation(overrides: Partial<InvitationDto> = {}): InvitationDto {
  return {
    id: 'b0000000-0000-4000-8000-000000000009',
    kind: 'ORGANISATION',
    organisationId: ORG_B,
    email: 'owner@niger-gas.example',
    roles: ['ORGANISATION_OWNER'],
    status: 'PENDING',
    invitedBy: { id: ADMIN.id, name: ADMIN.name },
    createdAt: '2026-11-15T09:00:00.000Z',
    expiresAt: '2026-11-20T09:00:00.000Z',
    respondedAt: null,
    revokedAt: null,
    delivery: 'QUEUED',
    ...overrides,
  };
}

function org(overrides: Partial<PlatformOrganisationDto> = {}): PlatformOrganisationDto {
  return {
    id: ORG_A,
    name: 'Delta Energy',
    slug: 'delta-energy',
    country: 'NG',
    status: 'ACTIVE',
    createdAt: '2026-11-01T09:00:00.000Z',
    activeMemberCount: 4,
    hasActiveOwner: true,
    dormant: false,
    pendingOwnerInvitation: null,
    ...overrides,
  };
}

describe('platform administration: organisations', () => {
  it('lists organisations with their dormant state and pending Owner invitation', async () => {
    mockApi(
      signedInAsAdmin,
      on('GET', '/admin/organisations', () => ({
        status: 200,
        body: {
          data: [
            org(),
            org({
              id: ORG_B,
              name: 'Niger Gas',
              slug: 'niger-gas',
              activeMemberCount: 0,
              hasActiveOwner: false,
              dormant: true,
              pendingOwnerInvitation: ownerInvitation(),
            }),
            org({
              id: '33333333-3333-4333-8333-333333333333',
              name: 'Kano Flare Co',
              hasActiveOwner: false,
              dormant: true,
            }),
          ],
        },
      })),
    );
    renderApp('/admin/organisations');
    expect(await screen.findByRole('heading', { name: 'Organisations' })).toBeInTheDocument();
    expect(await screen.findAllByText('Dormant: no active Owner')).toHaveLength(2);
    expect(screen.getByText('Has an active Owner')).toBeInTheDocument();
    expect(
      screen.getByText('Owner invitation pending for owner@niger-gas.example'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Revoke the Owner invitation for Niger Gas' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Invite an Owner for Kano Flare Co' }),
    ).toBeInTheDocument();
    // Organisations with an Owner manage their own members.
    expect(
      screen.queryByRole('button', { name: 'Invite an Owner for Delta Energy' }),
    ).not.toBeInTheDocument();
    // The navigation offers every platform page.
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Organisations' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Platform administrators' })).toBeInTheDocument();
  });

  it('creates an organisation with its first Owner’s email', async () => {
    let created = false;
    const { requests } = mockApi(
      signedInAsAdmin,
      on('GET', '/admin/organisations', () => ({
        status: 200,
        body: {
          data: created
            ? [
                org({
                  name: 'Bonny Gas',
                  hasActiveOwner: false,
                  dormant: true,
                  activeMemberCount: 0,
                  pendingOwnerInvitation: ownerInvitation({ email: 'ngozi@bonny.example' }),
                }),
              ]
            : [],
        },
      })),
      on('POST', '/admin/organisations', () => {
        created = true;
        return {
          status: 201,
          body: { data: org({ name: 'Bonny Gas', dormant: true, hasActiveOwner: false }) },
        };
      }),
    );
    renderApp('/admin/organisations');
    expect(await screen.findByText('No organisations yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create an organisation' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/^Country/)).toHaveValue('NG');
    fireEvent.change(within(dialog).getByLabelText(/^Organisation name/), {
      target: { value: 'Bonny Gas' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^First Owner’s email/), {
      target: { value: 'ngozi@bonny.example' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and invite Owner' }));

    expect(
      await screen.findByText(
        'Bonny Gas created. An Owner invitation was sent to ngozi@bonny.example.',
      ),
    ).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      name: 'Bonny Gas',
      country: 'NG',
      ownerEmail: 'ngozi@bonny.example',
    });
    expect(await screen.findByText('Dormant: no active Owner')).toBeInTheDocument();
  });

  it('is for Platform Administrators only', async () => {
    const { requests } = mockApi(
      on('GET', '/auth/session', () => ({ status: 200, body: { data: sessionWith([], ADA) } })),
    );
    renderApp('/admin/organisations');
    expect(await screen.findByText('For Platform Administrators only')).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/admin/'))).toBe(false);
  });
});

function admin(overrides: Partial<PlatformAdminDto> = {}): PlatformAdminDto {
  return {
    userId: 'user-9',
    name: 'Funmi Ade',
    email: 'funmi@example.com',
    isSupremeAdmin: false,
    status: 'ACTIVE',
    createdAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

function admins(viewerIsSupremeAdmin: boolean): PlatformAdminsDto {
  return {
    administrators: [
      admin({
        userId: ADA.id,
        name: ADA.name,
        email: ADA.email,
        isSupremeAdmin: viewerIsSupremeAdmin,
      }),
      admin(),
      ...(viewerIsSupremeAdmin
        ? []
        : [
            admin({
              userId: 'user-10',
              name: 'Supreme Sola',
              email: 'sola@example.com',
              isSupremeAdmin: true,
            }),
          ]),
    ],
    invitations: [
      ownerInvitation({
        id: 'b0000000-0000-4000-8000-000000000010',
        kind: 'PLATFORM_ADMIN',
        organisationId: null,
        roles: [],
        email: 'new-admin@example.com',
      }),
    ],
    viewerIsSupremeAdmin,
  };
}

describe('platform administration: administrators', () => {
  it('lets the supreme administrator remove others, never themself', async () => {
    const { requests } = mockApi(
      signedInAsAdmin,
      on('GET', '/admin/platform-admins', () => ({ status: 200, body: { data: admins(true) } })),
      on('POST', '/admin/platform-admins/user-9/remove', () => ({
        status: 200,
        body: { data: { userId: 'user-9', accountDisabled: true } },
      })),
    );
    renderApp('/admin/platform-admins');
    expect(await screen.findByText('Supreme administrator')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove administration rights from Ada Obi' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove administration rights from Funmi Ade' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'If they belong to no organisation, their account is disabled',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove admin status' }));
    expect(
      await screen.findByText(/Funmi Ade is no longer a Platform Administrator\. .*disabled/),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/admin/platform-admins/user-9/remove')).toBe(true);
  });

  it('offers no removal to other administrators', async () => {
    mockApi(
      signedInAsAdmin,
      on('GET', '/admin/platform-admins', () => ({ status: 200, body: { data: admins(false) } })),
    );
    renderApp('/admin/platform-admins');
    expect(await screen.findByText('Funmi Ade')).toBeInTheDocument();
    expect(
      screen.getByText('Only the supreme Platform Administrator can remove administration rights.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Remove administration rights/ }),
    ).not.toBeInTheDocument();
  });

  it('invites an administrator and revokes a pending invitation', async () => {
    const { requests } = mockApi(
      signedInAsAdmin,
      on('GET', '/admin/platform-admins', () => ({ status: 200, body: { data: admins(false) } })),
      on('POST', '/admin/platform-admins/invitations', () => ({
        status: 409,
        body: { error: { code: 'ALREADY_PLATFORM_ADMIN', message: 'x' } },
      })),
      on('POST', '/admin/invitations/b0000000-0000-4000-8000-000000000010/revoke', () => ({
        status: 200,
        body: { data: ownerInvitation({ status: 'REVOKED' }) },
      })),
    );
    renderApp('/admin/platform-admins');
    expect(await screen.findByText('new-admin@example.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Invite an administrator' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Email/), {
      target: { value: 'funmi@example.com' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This person is already a Platform Administrator.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke the invitation to new-admin@example.com' }),
    );
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke invitation' }));
    expect(
      await screen.findByText('Invitation to new-admin@example.com revoked.'),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.endsWith('/revoke'))).toBe(true);
  });
});

function email(overrides: Partial<DevMailboxEmailDto> = {}): DevMailboxEmailDto {
  return {
    id: 'e1',
    to: 'bayo@example.com',
    template: 'ORGANISATION_INVITATION',
    status: 'PENDING',
    createdAt: '2026-11-16T09:00:00.000Z',
    subject: 'Chika Eze invited you to Delta Energy on Flame',
    text: 'Open the invitation: http://localhost:5173/invite/abc123 It expires soon.',
    html: '<p>x</p>',
    ...overrides,
  };
}

describe('the development mailbox', () => {
  it('lists emails with clickable links in development builds', async () => {
    mockApi(on('GET', '/dev/mailbox', () => ({ status: 200, body: { data: [email()] } })));
    renderApp('/dev/mailbox');
    expect(await screen.findByText('Development only')).toBeInTheDocument();
    expect(
      await screen.findByText('Chika Eze invited you to Delta Energy on Flame'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'http://localhost:5173/invite/abc123' }),
    ).toHaveAttribute('href', 'http://localhost:5173/invite/abc123');
  });

  it('explains when the API is not running in development mode', async () => {
    mockApi(
      on('GET', '/dev/mailbox', () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Not found' } },
      })),
    );
    renderApp('/dev/mailbox');
    expect(await screen.findByText('The development mailbox isn’t available')).toBeInTheDocument();
  });

  it('does not exist outside development builds', async () => {
    vi.stubEnv('DEV', false);
    const { requests } = mockApi();
    renderApp('/dev/mailbox');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });
});
