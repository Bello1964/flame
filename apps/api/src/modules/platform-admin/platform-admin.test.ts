import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PlatformAdminsDto, PlatformOrganisationDto } from '@flame/shared';
import {
  CSRF_HEADER,
  addMember,
  createOrganisation,
  createUser,
  inviteTokenFor,
  login,
  makeApp,
  ownerPrisma,
  prisma,
  resetDatabase,
  type LoggedIn,
} from '../../test/context.js';
import { slugify } from './platform-admin.service.js';
import { transferSupremeAdmin } from './supreme.js';

const app = makeApp();
const API = '/api/v1';
const PASSWORD_NEW = 'Owner-password-for-tests-9';

function post(user: LoggedIn, path: string, body: object = {}) {
  return user.agent.post(path).set(CSRF_HEADER, user.csrfToken).send(body);
}

let supreme: LoggedIn;
let supremeId: string;
let admin2: LoggedIn;
let admin2Id: string;

beforeEach(async () => {
  await resetDatabase();
  const s = await createUser('supreme@example.com', { isPlatformAdmin: true });
  await prisma.user.update({ where: { id: s.id }, data: { isSupremeAdmin: true } });
  supremeId = s.id;
  supreme = await login(app, 'supreme@example.com');
  admin2Id = (await createUser('admin2@example.com', { isPlatformAdmin: true })).id;
  admin2 = await login(app, 'admin2@example.com');
});

async function createOrg(name: string, ownerEmail: string, by: LoggedIn = admin2) {
  const res = await post(by, `${API}/admin/organisations`, { name, ownerEmail });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as PlatformOrganisationDto;
}

describe('access', () => {
  it('is for Platform Administrators only', async () => {
    const org = await createOrganisation('acme');
    const ownerUser = await createUser('owner@example.com');
    await addMember(ownerUser.id, org.id, ['ORGANISATION_OWNER']);
    const owner = await login(app, 'owner@example.com');
    for (const res of [
      await owner.agent.get(`${API}/admin/organisations`),
      await owner.agent.get(`${API}/admin/platform-admins`),
      await post(owner, `${API}/admin/organisations`, { name: 'X', ownerEmail: 'x@example.com' }),
      await post(owner, `${API}/admin/platform-admins/invitations`, { email: 'x@example.com' }),
    ]) {
      expect(res.status).toBe(403);
    }
    expect((await request(app).get(`${API}/admin/organisations`)).status).toBe(401);
  });

  it('gives a Platform Administrator no access to organisation data', async () => {
    const org = await createOrg('Delta Gas', 'owner@example.com');
    expect((await admin2.agent.get(`${API}/organisations/${org.id}`)).status).toBe(404);
    expect((await admin2.agent.get(`${API}/organisations/${org.id}/members`)).status).toBe(404);
  });
});

describe('organisations', () => {
  it('creates an organisation and invites its Owner, without making the administrator a member', async () => {
    const org = await createOrg('  Delta Gás & Power Ltd ', ' Owner@Example.com');
    expect(org).toMatchObject({
      name: 'Delta Gás & Power Ltd',
      slug: 'delta-gas-power-ltd',
      country: 'NG',
      status: 'ACTIVE',
      activeMemberCount: 0,
      hasActiveOwner: false,
      dormant: true,
      pendingOwnerInvitation: {
        kind: 'ORGANISATION',
        email: 'owner@example.com',
        roles: ['ORGANISATION_OWNER'],
        status: 'PENDING',
        delivery: 'QUEUED',
      },
    });
    expect(await prisma.membership.count({ where: { organisationId: org.id } })).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'organisation.created' },
    });
    expect(audit).toMatchObject({ organisationId: org.id, actorUserId: admin2Id });

    // Collisions get a suffix; a country can be given.
    const second = await post(admin2, `${API}/admin/organisations`, {
      name: 'Delta Gas Power Ltd',
      country: 'gh',
      ownerEmail: 'other@example.com',
    });
    expect(second.body.data).toMatchObject({ slug: 'delta-gas-power-ltd-2', country: 'GH' });
    const badCountry = await post(admin2, `${API}/admin/organisations`, {
      name: 'Z',
      country: 'XX',
      ownerEmail: 'z@example.com',
    });
    expect(badCountry.status).toBe(400);

    // The invited Owner accepts and the organisation is theirs.
    const token = await inviteTokenFor('owner@example.com');
    const accepted = await request(app)
      .post(`${API}/invitations/accept`)
      .send({ token, name: 'Ada Owner', password: PASSWORD_NEW });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    const list = (await admin2.agent.get(`${API}/admin/organisations`)).body
      .data as PlatformOrganisationDto[];
    expect(list.find((o) => o.id === org.id)).toMatchObject({
      activeMemberCount: 1,
      hasActiveOwner: true,
      dormant: false,
      pendingOwnerInvitation: null,
    });
  });

  it('lets an administrator revoke and re-issue the Owner invitation until there is an Owner', async () => {
    const org = await createOrg('Delta', 'wrong@example.com');
    const pending = org.pendingOwnerInvitation;
    expect(pending).not.toBeNull();

    const reissue = await post(admin2, `${API}/admin/organisations/${org.id}/owner-invitation`, {
      email: 'right@example.com',
    });
    expect(reissue.status).toBe(409);
    expect(reissue.body.error.code).toBe('INVITATION_PENDING');

    const revoked = await post(supreme, `${API}/admin/invitations/${pending?.id ?? ''}/revoke`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.status).toBe('REVOKED');
    const issued = await post(admin2, `${API}/admin/organisations/${org.id}/owner-invitation`, {
      email: 'right@example.com',
    });
    expect(issued.status).toBe(201);

    const token = await inviteTokenFor('right@example.com');
    await request(app)
      .post(`${API}/invitations/accept`)
      .send({ token, name: 'Right', password: PASSWORD_NEW })
      .expect(200);
    const afterOwner = await post(admin2, `${API}/admin/organisations/${org.id}/owner-invitation`, {
      email: 'third@example.com',
    });
    expect(afterOwner.status).toBe(409);
    expect(afterOwner.body.error.code).toBe('ORGANISATION_HAS_OWNER');

    // Invitations the organisation sends itself are its own business.
    const owner = await login(app, 'right@example.com', PASSWORD_NEW);
    const own = await post(owner, `${API}/organisations/${org.id}/invitations`, {
      email: 'staff@example.com',
      roles: ['VIEWER'],
    });
    expect(own.status).toBe(201);
    expect(
      (await post(admin2, `${API}/admin/invitations/${own.body.data.id as string}/revoke`)).status,
    ).toBe(404);
  });

  it('revives a dormant organisation: its members carry on, and a new Owner can be invited', async () => {
    const org = await createOrg('Delta', 'first@example.com');
    const token = await inviteTokenFor('first@example.com');
    await request(app)
      .post(`${API}/invitations/accept`)
      .send({ token, name: 'First', password: PASSWORD_NEW })
      .expect(200);
    const first = await login(app, 'first@example.com', PASSWORD_NEW);
    const adminUser = await createUser('orgadmin@example.com');
    await addMember(adminUser.id, org.id, ['ADMINISTRATOR']);
    const orgAdmin = await login(app, 'orgadmin@example.com');

    // The organisation's Administrator removes its only Owner.
    const members = (await orgAdmin.agent.get(`${API}/organisations/${org.id}/members`)).body.data;
    const ownerMembership = members.find((m: { email: string }) => m.email === 'first@example.com');
    await post(
      orgAdmin,
      `${API}/organisations/${org.id}/members/${ownerMembership.membershipId as string}/remove`,
    ).expect(200);
    expect((await first.agent.get(`${API}/organisations/${org.id}`)).status).toBe(401);

    const listed = (await admin2.agent.get(`${API}/admin/organisations`)).body
      .data as PlatformOrganisationDto[];
    expect(listed.find((o) => o.id === org.id)).toMatchObject({
      dormant: true,
      hasActiveOwner: false,
      activeMemberCount: 1,
      pendingOwnerInvitation: null,
    });
    const issued = await post(admin2, `${API}/admin/organisations/${org.id}/owner-invitation`, {
      email: 'second@example.com',
    });
    expect(issued.status).toBe(201);
    const after = (await admin2.agent.get(`${API}/admin/organisations`)).body
      .data as PlatformOrganisationDto[];
    expect(after.find((o) => o.id === org.id)?.pendingOwnerInvitation?.email).toBe(
      'second@example.com',
    );
  });

  it('slugifies names into URL-safe slugs', () => {
    expect(slugify('Shell Petroleum Development Co. of Nigeria')).toBe(
      'shell-petroleum-development-co-of-nigeria',
    );
    expect(slugify('Ọ̀yọ́ Gas')).toBe('oyo-gas');
    expect(slugify('***')).toBe('organisation');
  });
});

describe('Platform Administrators', () => {
  it('lists administrators and pending invitations, and says who is supreme', async () => {
    await post(admin2, `${API}/admin/platform-admins/invitations`, { email: 'new@example.com' });
    const res = await admin2.agent.get(`${API}/admin/platform-admins`);
    const data = res.body.data as PlatformAdminsDto;
    expect(data.viewerIsSupremeAdmin).toBe(false);
    expect(data.administrators.map((a) => [a.email, a.isSupremeAdmin])).toEqual([
      ['admin2@example.com', false],
      ['supreme@example.com', true],
    ]);
    expect(data.invitations).toMatchObject([
      { kind: 'PLATFORM_ADMIN', email: 'new@example.com', roles: [], organisationId: null },
    ]);
    expect(
      (await supreme.agent.get(`${API}/admin/platform-admins`)).body.data.viewerIsSupremeAdmin,
    ).toBe(true);
  });

  it('invites a Platform Administrator, who becomes one by accepting', async () => {
    const res = await post(admin2, `${API}/admin/platform-admins/invitations`, {
      email: 'new@example.com',
    });
    expect(res.status).toBe(201);
    const again = await post(supreme, `${API}/admin/platform-admins/invitations`, {
      email: 'new@example.com',
    });
    expect(again.body.error.code).toBe('INVITATION_PENDING');
    const existing = await post(admin2, `${API}/admin/platform-admins/invitations`, {
      email: 'supreme@example.com',
    });
    expect(existing.body.error.code).toBe('ALREADY_PLATFORM_ADMIN');

    const outbox = await prisma.emailOutbox.findFirstOrThrow({
      where: { recipient: 'new@example.com' },
    });
    expect(outbox.template).toBe('PLATFORM_ADMIN_INVITATION');
    const token = await inviteTokenFor('new@example.com');
    const lookup = await request(app).post(`${API}/invitations/lookup`).send({ token });
    expect(lookup.body.data).toMatchObject({
      kind: 'PLATFORM_ADMIN',
      organisationId: null,
      organisationName: null,
    });
    const accepted = await request(app)
      .post(`${API}/invitations/accept`)
      .send({ token, name: 'New Admin', password: PASSWORD_NEW });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.user.isPlatformAdmin).toBe(true);
    expect(accepted.body.data.memberships).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: 'platform_admin.granted' } })).toBe(1);

    // Any administrator may revoke a pending administrator invitation.
    const other = await post(admin2, `${API}/admin/platform-admins/invitations`, {
      email: 'other@example.com',
    });
    const revoked = await post(
      supreme,
      `${API}/admin/invitations/${other.body.data.id as string}/revoke`,
    );
    expect(revoked.body.data.status).toBe('REVOKED');
  });

  it('lets only the supreme administrator remove administration rights', async () => {
    const denied = await post(admin2, `${API}/admin/platform-admins/${supremeId}/remove`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('SUPREME_ADMIN_REQUIRED');

    const self = await post(supreme, `${API}/admin/platform-admins/${supremeId}/remove`);
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('SUPREME_ADMIN_PROTECTED');

    const removed = await post(supreme, `${API}/admin/platform-admins/${admin2Id}/remove`);
    expect(removed.status).toBe(200);
    // No membership anywhere: the account is disabled and signed out.
    expect(removed.body.data).toEqual({ userId: admin2Id, accountDisabled: true });
    expect((await admin2.agent.get(`${API}/auth/session`)).status).toBe(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: admin2Id } });
    expect(user).toMatchObject({ isPlatformAdmin: false, status: 'DISABLED' });
    expect((await post(supreme, `${API}/admin/platform-admins/${admin2Id}/remove`)).status).toBe(
      404,
    );
    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['platform_admin.removed', 'user.disabled']));
  });

  it('keeps an administrator’s account enabled when they still belong to an organisation', async () => {
    const org = await createOrganisation('acme');
    await addMember(admin2Id, org.id, ['VIEWER']);
    const res = await post(supreme, `${API}/admin/platform-admins/${admin2Id}/remove`);
    expect(res.body.data.accountDisabled).toBe(false);
    const session = await admin2.agent.get(`${API}/auth/session`);
    expect(session.status).toBe(200);
    expect(session.body.data.user.isPlatformAdmin).toBe(false);
    expect((await admin2.agent.get(`${API}/admin/organisations`)).status).toBe(403);
  });
});

describe('the supreme administrator', () => {
  it('is unique and always a Platform Administrator (database constraints)', async () => {
    await expect(
      ownerPrisma.user.update({ where: { id: admin2Id }, data: { isSupremeAdmin: true } }),
    ).rejects.toThrow();
    const plain = await createUser('plain@example.com');
    await prisma.user.update({ where: { id: supremeId }, data: { isSupremeAdmin: false } });
    await expect(
      ownerPrisma.user.update({ where: { id: plain.id }, data: { isSupremeAdmin: true } }),
    ).rejects.toThrow();
  });

  it('is transferred by the operator script to an active Platform Administrator, audited', async () => {
    await createUser('plain@example.com');
    await expect(transferSupremeAdmin(prisma, 'plain@example.com')).rejects.toThrow(
      /active Platform Administrator/,
    );
    await expect(transferSupremeAdmin(prisma, 'nobody@example.com')).rejects.toThrow();

    const result = await transferSupremeAdmin(prisma, ' Admin2@Example.com ');
    expect(result).toEqual({ fromUserId: supremeId, toUserId: admin2Id });
    const supremes = await prisma.user.findMany({ where: { isSupremeAdmin: true } });
    expect(supremes.map((u) => u.id)).toEqual([admin2Id]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'platform_admin.supreme_transferred' },
    });
    expect(audit).toMatchObject({
      actorUserId: null,
      entityId: admin2Id,
      metadata: { fromUserId: supremeId, via: 'operator_script' },
    });
  });
});

describe('reviving a dormant organisation', () => {
  /** An organisation with an active Owner and an Administrator, both signed in. */
  async function organisationWithOwner() {
    const org = await createOrg('Delta', 'first@example.com');
    const token = await inviteTokenFor('first@example.com');
    await request(app)
      .post(`${API}/invitations/accept`)
      .send({ token, name: 'First', password: PASSWORD_NEW })
      .expect(200);
    const adminUser = await createUser('orgadmin@example.com');
    await addMember(adminUser.id, org.id, ['ADMINISTRATOR']);
    const orgAdmin = await login(app, 'orgadmin@example.com');
    const members = (await orgAdmin.agent.get(`${API}/organisations/${org.id}/members`)).body
      .data as { email: string; membershipId: string }[];
    const ownerMembership = members.find((m) => m.email === 'first@example.com')!.membershipId;
    return {
      org,
      orgAdmin,
      ownerPath: `${API}/organisations/${org.id}/members/${ownerMembership}`,
    };
  }

  it('refuses the platform Owner invitation once the organisation has an active Owner again', async () => {
    const { org, orgAdmin, ownerPath } = await organisationWithOwner();
    await post(orgAdmin, `${ownerPath}/suspend`).expect(200);
    const issued = await post(admin2, `${API}/admin/organisations/${org.id}/owner-invitation`, {
      email: 'second@example.com',
    });
    expect(issued.status).toBe(201);
    const token = await inviteTokenFor('second@example.com');
    await post(orgAdmin, `${ownerPath}/reinstate`).expect(200);

    const res = await request(app)
      .post(`${API}/invitations/accept`)
      .send({ token, name: 'Second', password: PASSWORD_NEW });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORGANISATION_NOT_DORMANT');
    expect(await prisma.user.count({ where: { email: 'second@example.com' } })).toBe(0);
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: issued.body.data.id as string } }))
        .status,
    ).toBe('PENDING');
    // An administrator can still revoke it.
    const revoked = await post(
      admin2,
      `${API}/admin/invitations/${issued.body.data.id as string}/revoke`,
    );
    expect(revoked.status).toBe(200);
  });

  it('lets an active member become the Owner, keeping their roles', async () => {
    const { org, orgAdmin, ownerPath } = await organisationWithOwner();
    await post(orgAdmin, `${ownerPath}/remove`).expect(200);
    const issued = await post(admin2, `${API}/admin/organisations/${org.id}/owner-invitation`, {
      email: 'orgadmin@example.com',
    });
    expect(issued.status, JSON.stringify(issued.body)).toBe(201);
    const token = await inviteTokenFor('orgadmin@example.com');
    const accepted = await post(orgAdmin, `${API}/invitations/accept`, { token });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.data.memberships).toMatchObject([
      { organisationId: org.id, roles: ['ORGANISATION_OWNER', 'ADMINISTRATOR'] },
    ]);
    const organisation = await orgAdmin.agent.get(`${API}/organisations/${org.id}`);
    expect(organisation.body.data.dormant).toBe(false);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'membership.roles_changed', organisationId: org.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.metadata).toMatchObject({
      fromRoles: ['ADMINISTRATOR'],
      toRoles: ['ORGANISATION_OWNER', 'ADMINISTRATOR'],
      via: 'invitation',
    });
  });

  it('refuses a suspended member: an Administrator must reinstate them first', async () => {
    const { org, orgAdmin, ownerPath } = await organisationWithOwner();
    const viewer = await createUser('viewer@example.com');
    const viewerMembership = await addMember(viewer.id, org.id, ['VIEWER'], 'SUSPENDED');
    expect(viewerMembership.status).toBe('SUSPENDED');
    await post(orgAdmin, `${ownerPath}/remove`).expect(200);
    const res = await post(admin2, `${API}/admin/organisations/${org.id}/owner-invitation`, {
      email: 'viewer@example.com',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEMBER_SUSPENDED');
  });
});

describe('an administrator who loses platform administration', () => {
  it('loses their pending administrator and Owner invitations', async () => {
    const platformInvite = await post(admin2, `${API}/admin/platform-admins/invitations`, {
      email: 'new-admin@example.com',
    });
    const org = await createOrg('Delta', 'owner@example.com');
    const ownerInvite = org.pendingOwnerInvitation!.id;
    const otherInvite = await post(supreme, `${API}/admin/platform-admins/invitations`, {
      email: 'kept@example.com',
    });

    const removed = await post(supreme, `${API}/admin/platform-admins/${admin2Id}/remove`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    for (const id of [platformInvite.body.data.id as string, ownerInvite]) {
      expect((await prisma.invitation.findUniqueOrThrow({ where: { id } })).status).toBe('REVOKED');
      expect(
        (await prisma.emailOutbox.findFirstOrThrow({ where: { invitationId: id } })).status,
      ).toBe('CANCELLED');
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'invitation.revoked', entityId: id },
      });
      expect(audit).toMatchObject({
        actorUserId: supremeId,
        metadata: { reason: 'inviter_lost_platform_admin' },
      });
    }
    expect(
      (
        await prisma.invitation.findUniqueOrThrow({
          where: { id: otherInvite.body.data.id as string },
        })
      ).status,
    ).toBe('PENDING');
  });
});
