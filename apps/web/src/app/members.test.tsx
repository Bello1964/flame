import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  InvitationDto,
  MemberDto,
  MemberRemovalDto,
  OrganisationDto,
  Role,
} from '@flame/shared';
import { ADA, membership, mockApi, on, ORG_A, renderApp, sessionWith } from '@/test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ADA_MEMBERSHIP = 'a0000000-0000-4000-8000-000000000001';
const BAYO_MEMBERSHIP = 'a0000000-0000-4000-8000-000000000002';
const CHIKA_MEMBERSHIP = 'a0000000-0000-4000-8000-000000000003';
const INVITATION_ID = 'b0000000-0000-4000-8000-000000000001';

function member(overrides: Partial<MemberDto> = {}): MemberDto {
  return {
    membershipId: BAYO_MEMBERSHIP,
    userId: 'user-2',
    name: 'Bayo Lawal',
    email: 'bayo@example.com',
    roles: ['REVIEWER'],
    status: 'ACTIVE',
    joinedAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
    isSelf: false,
    ...overrides,
  };
}

function invitation(overrides: Partial<InvitationDto> = {}): InvitationDto {
  return {
    id: INVITATION_ID,
    kind: 'ORGANISATION',
    organisationId: ORG_A,
    email: 'dayo@example.com',
    roles: ['DATA_ENTRY_OFFICER'],
    status: 'PENDING',
    invitedBy: { id: ADA.id, name: ADA.name },
    createdAt: '2026-11-15T09:00:00.000Z',
    expiresAt: '2026-11-20T09:00:00.000Z',
    respondedAt: null,
    revokedAt: null,
    delivery: 'SENT',
    ...overrides,
  };
}

function organisation(roles: Role[], dormant = false): OrganisationDto {
  return {
    id: ORG_A,
    name: 'Delta Energy',
    slug: 'delta-energy',
    country: 'NG',
    roles,
    dormant,
  };
}

const membersPath = `/organisations/${ORG_A}/members`;
const invitationsPath = `/organisations/${ORG_A}/invitations`;

/** A signed-in viewer with these roles, an organisation, members and invitations. */
function api(
  roles: Role[],
  {
    dormant = false,
    members = [
      member({
        membershipId: ADA_MEMBERSHIP,
        userId: ADA.id,
        name: ADA.name,
        email: ADA.email,
        roles,
        isSelf: true,
      }),
      member(),
      member({
        membershipId: CHIKA_MEMBERSHIP,
        userId: 'user-3',
        name: 'Chika Eze',
        email: 'chika@example.com',
        roles: ['ORGANISATION_OWNER'],
      }),
    ],
    invitations = [invitation()],
  }: { dormant?: boolean; members?: MemberDto[]; invitations?: InvitationDto[] } = {},
  ...extra: ReturnType<typeof on>[]
) {
  return mockApi(
    on('GET', '/auth/session', () => ({
      status: 200,
      body: { data: sessionWith([membership(ORG_A, roles)]) },
    })),
    ...extra,
    on('GET', `/organisations/${ORG_A}`, () => ({
      status: 200,
      body: { data: organisation(roles, dormant) },
    })),
    on('GET', membersPath, () => ({ status: 200, body: { data: members } })),
    on('GET', invitationsPath, () => ({ status: 200, body: { data: invitations } })),
  );
}

describe('the members page', () => {
  it('is in the navigation for Owners and Administrators only', async () => {
    api(['ADMINISTRATOR']);
    const admin = renderApp(`/o/${ORG_A}/members`);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Members' })).toHaveAttribute(
      'href',
      `/o/${ORG_A}/members`,
    );
    admin.unmount();
    vi.unstubAllGlobals();

    const { requests } = api(['VIEWER', 'REVIEWER']);
    renderApp(`/o/${ORG_A}/members`);
    expect(
      await screen.findByText('Your roles don’t include managing members'),
    ).toBeInTheDocument();
    const viewerNav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(viewerNav).queryByRole('link', { name: 'Members' })).not.toBeInTheDocument();
    // Nothing is requested that the API would refuse.
    expect(requests.some((r) => r.path.startsWith(membersPath))).toBe(false);
  });

  it('lists members and never offers changes to the viewer’s own membership', async () => {
    api(['ORGANISATION_OWNER']);
    renderApp(`/o/${ORG_A}/members`);
    const table = await screen.findByRole('table');
    const own = within(table).getByText('Ada Obi').closest('tr');
    expect(own).not.toBeNull();
    const ownRow = within(own as HTMLElement);
    expect(ownRow.getByText('You')).toBeInTheDocument();
    expect(ownRow.getByText(/can’t change your own membership/)).toBeInTheDocument();
    expect(ownRow.queryByRole('button')).not.toBeInTheDocument();

    const bayo = within(within(table).getByText('Bayo Lawal').closest('tr') as HTMLElement);
    expect(bayo.getByText('Reviewer')).toBeInTheDocument();
    expect(bayo.getByText('Active')).toBeInTheDocument();
    expect(bayo.getByRole('button', { name: 'Change roles for Bayo Lawal' })).toBeInTheDocument();
    expect(bayo.getByRole('button', { name: 'Suspend Bayo Lawal' })).toBeInTheDocument();
    expect(bayo.getByRole('button', { name: 'Remove Bayo Lawal' })).toBeInTheDocument();
  });

  it('does not let an Administrator grant the Owner role, but lets them take it away', async () => {
    const { requests } = api(
      ['ADMINISTRATOR'],
      {},
      on('PATCH', `${membersPath}/${CHIKA_MEMBERSHIP}`, () => ({
        status: 200,
        body: {
          data: member({
            membershipId: CHIKA_MEMBERSHIP,
            name: 'Chika Eze',
            roles: ['ADMINISTRATOR'],
          }),
        },
      })),
    );
    renderApp(`/o/${ORG_A}/members`);

    fireEvent.click(await screen.findByRole('button', { name: 'Change roles for Bayo Lawal' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /^Owner/ })).toBeDisabled();
    expect(within(dialog).getByText('Only an Owner can grant the Owner role.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Chika is an Owner: the Administrator may remove the role.
    fireEvent.click(screen.getByRole('button', { name: 'Change roles for Chika Eze' }));
    dialog = await screen.findByRole('dialog');
    const owner = within(dialog).getByRole('checkbox', { name: /^Owner/ });
    expect(owner).toBeEnabled();
    fireEvent.click(owner);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /^Administrator/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save roles' }));
    await waitFor(() => {
      expect(requests.some((r) => r.method === 'PATCH')).toBe(true);
    });
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ roles: ['ADMINISTRATOR'] });

    // The invitation dialog locks the Owner role too.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite a member' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /^Owner/ })).toBeDisabled();
  });

  it('lets an Owner grant the Owner role', async () => {
    api(['ORGANISATION_OWNER']);
    renderApp(`/o/${ORG_A}/members`);
    fireEvent.click(await screen.findByRole('button', { name: 'Change roles for Bayo Lawal' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /^Owner/ })).toBeEnabled();
  });

  it('says when the organisation has no active Owner', async () => {
    api(['ADMINISTRATOR'], { dormant: true });
    renderApp(`/o/${ORG_A}/members`);
    const note = await screen.findByRole('note', { name: 'This organisation has no active Owner' });
    expect(note).toHaveTextContent('A Platform Administrator must invite a new Owner');
  });

  it('does not show the notice when there is an active Owner', async () => {
    api(['ADMINISTRATOR']);
    renderApp(`/o/${ORG_A}/members`);
    await screen.findByRole('table');
    expect(screen.queryByText('This organisation has no active Owner')).not.toBeInTheDocument();
  });

  it('invites by email with roles, and explains how to replace a pending invitation', async () => {
    let attempts = 0;
    const { requests } = api(
      ['ORGANISATION_OWNER'],
      {},
      on('POST', invitationsPath, () => {
        attempts += 1;
        return attempts === 1
          ? {
              status: 409,
              body: {
                error: { code: 'INVITATION_PENDING', message: 'A valid invitation already exists' },
              },
            }
          : { status: 201, body: { data: invitation({ email: 'eze@example.com' }) } };
      }),
    );
    renderApp(`/o/${ORG_A}/members`);
    fireEvent.click(await screen.findByRole('button', { name: 'Invite a member' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('valid for 5 days');

    // Roles are required.
    fireEvent.change(within(dialog).getByLabelText(/^Email/), {
      target: { value: 'dayo@example.com' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(await within(dialog).findByText('Choose at least one role')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /^Reviewer/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /^Viewer/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /revoke the pending invitation, then invite again/,
    );
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      email: 'dayo@example.com',
      roles: ['REVIEWER', 'VIEWER'],
    });

    fireEvent.change(within(dialog).getByLabelText(/^Email/), {
      target: { value: 'eze@example.com' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(await screen.findByText('Invitation sent to eze@example.com.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows invitation delivery and expiry, and revokes after confirmation', async () => {
    const { requests } = api(
      ['ADMINISTRATOR'],
      {
        invitations: [
          invitation(),
          invitation({
            id: 'b0000000-0000-4000-8000-000000000002',
            email: 'old@example.com',
            status: 'EXPIRED',
            delivery: 'FAILED',
          }),
        ],
      },
      on('POST', `${invitationsPath}/${INVITATION_ID}/revoke`, () => ({
        status: 200,
        body: { data: invitation({ status: 'REVOKED', revokedAt: '2026-11-16T09:00:00.000Z' }) },
      })),
    );
    renderApp(`/o/${ORG_A}/members`);
    expect(await screen.findByText('dayo@example.com')).toBeInTheDocument();
    expect(screen.getByText(/can’t be re-sent/)).toBeInTheDocument();
    expect(screen.getByText(/Expires/)).toBeInTheDocument();
    expect(screen.getByText(/Not delivered/)).toBeInTheDocument();
    expect(screen.getByText('Expired', { selector: 'span' })).toBeInTheDocument();
    // Only pending invitations can be revoked.
    expect(screen.getAllByRole('button', { name: /^Revoke the invitation/ })).toHaveLength(1);

    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke the invitation to dayo@example.com' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('The link stops working');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke invitation' }));
    expect(await screen.findByText(/revoked\. You can now invite them again/)).toBeInTheDocument();
    expect(
      requests.some(
        (r) => r.method === 'POST' && r.path === `${invitationsPath}/${INVITATION_ID}/revoke`,
      ),
    ).toBe(true);
  });

  it('confirms removal with its consequences and reports the outcome', async () => {
    const result: MemberRemovalDto = {
      member: member({ status: 'REMOVED' }),
      releasedClaims: { activityRecords: 2, calculations: 1 },
      accountDisabled: true,
    };
    const { requests } = api(
      ['ADMINISTRATOR'],
      {},
      on('POST', `${membersPath}/${BAYO_MEMBERSHIP}/remove`, () => ({
        status: 200,
        body: { data: result },
      })),
    );
    renderApp(`/o/${ORG_A}/members`);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Bayo Lawal' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('To rejoin, they need a new invitation');
    expect(dialog).toHaveTextContent('released back to Submitted');
    expect(dialog).toHaveTextContent('their account is disabled');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove member' }));

    const status = await screen.findByText(/Bayo Lawal was removed/);
    const notice = status.closest('[role="status"]') as HTMLElement;
    expect(notice).toHaveTextContent(
      'Released 2 activity record claims and 1 calculation claim back to Submitted.',
    );
    expect(notice).toHaveTextContent('their account was disabled');
    expect(
      requests.some((r) => r.method === 'POST' && r.path.endsWith(`${BAYO_MEMBERSHIP}/remove`)),
    ).toBe(true);
  });

  it('suspends and reinstates with a confirmation, and shows refusals in the dialog', async () => {
    api(
      ['ADMINISTRATOR'],
      {
        members: [
          member(),
          member({
            membershipId: CHIKA_MEMBERSHIP,
            name: 'Chika Eze',
            status: 'SUSPENDED',
          }),
        ],
      },
      on('POST', `${membersPath}/${BAYO_MEMBERSHIP}/suspend`, () => ({
        status: 403,
        body: { error: { code: 'SELF_MEMBERSHIP_CHANGE', message: 'x' } },
      })),
      on('POST', `${membersPath}/${CHIKA_MEMBERSHIP}/reinstate`, () => ({
        status: 200,
        body: { data: member({ membershipId: CHIKA_MEMBERSHIP, name: 'Chika Eze' }) },
      })),
    );
    renderApp(`/o/${ORG_A}/members`);
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend Bayo Lawal' }));
    let dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Suspension is temporary');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend member' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'You can’t change your own roles or suspend or remove yourself',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reinstate Chika Eze' }));
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reinstate member' }));
    expect(await screen.findByText('Chika Eze reinstated.')).toBeInTheDocument();
  });
});
