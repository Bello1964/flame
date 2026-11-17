import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { InvitationDto, MemberDto } from '@flame/shared';
import {
  CSRF_HEADER,
  addMember,
  approvedMethodology,
  createOrganisation,
  createUser,
  inviteTokenFor,
  login,
  makeApp,
  prisma,
  resetDatabase,
  type LoggedIn,
} from '../../test/context.js';
import type { Role } from '../../generated/prisma/client.js';

const app = makeApp();
const API = '/api/v1';
const base = (orgId: string) => `${API}/organisations/${orgId}`;

function post(user: LoggedIn, path: string, body: object = {}) {
  return user.agent.post(path).set(CSRF_HEADER, user.csrfToken).send(body);
}
function patch(user: LoggedIn, path: string, body: object) {
  return user.agent.patch(path).set(CSRF_HEADER, user.csrfToken).send(body);
}

async function member(email: string, orgId: string, roles: Role[]) {
  const user = await createUser(email);
  const membership = await addMember(user.id, orgId, roles);
  return { user, membership, session: await login(app, email) };
}

type Member = Awaited<ReturnType<typeof member>>;

interface World {
  org: string;
  orgB: string;
  owner: Member;
  owner2: Member;
  admin: Member;
  reviewer: Member;
  approver: Member;
  entry: Member;
  viewer: Member;
  ownerB: Member;
}
let w: World;

beforeEach(async () => {
  await resetDatabase();
  const [a, b] = await Promise.all([createOrganisation('org-a'), createOrganisation('org-b')]);
  w = {
    org: a.id,
    orgB: b.id,
    owner: await member('owner@example.com', a.id, ['ORGANISATION_OWNER']),
    owner2: await member('owner2@example.com', a.id, ['ORGANISATION_OWNER']),
    admin: await member('admin@example.com', a.id, ['ADMINISTRATOR']),
    reviewer: await member('reviewer@example.com', a.id, ['REVIEWER']),
    approver: await member('approver@example.com', a.id, ['APPROVER']),
    entry: await member('entry@example.com', a.id, ['DATA_ENTRY_OFFICER']),
    viewer: await member('viewer@example.com', a.id, ['VIEWER']),
    ownerB: await member('owner-b@example.com', b.id, ['ORGANISATION_OWNER']),
  };
});

const membersPath = () => `${base(w.org)}/members`;
const memberPath = (m: Member) => `${membersPath()}/${m.membership.id}`;

describe('permissions', () => {
  it('lets Owners and Administrators list members; everyone else gets 403', async () => {
    for (const m of [w.owner, w.admin]) {
      const res = await m.session.agent.get(membersPath());
      expect(res.status).toBe(200);
      const list = res.body.data as MemberDto[];
      expect(list.map((x) => x.email)).toContain('viewer@example.com');
      expect(list.find((x) => x.userId === m.user.id)?.isSelf).toBe(true);
      expect(list[0]).toEqual({
        membershipId: expect.any(String),
        userId: expect.any(String),
        name: expect.any(String),
        email: expect.any(String),
        roles: expect.any(Array),
        status: 'ACTIVE',
        joinedAt: expect.any(String),
        updatedAt: expect.any(String),
        isSelf: expect.any(Boolean),
      });
    }
    for (const m of [w.reviewer, w.approver, w.entry, w.viewer]) {
      expect((await m.session.agent.get(membersPath())).status).toBe(403);
      expect((await m.session.agent.get(`${base(w.org)}/invitations`)).status).toBe(403);
      expect(
        (
          await post(m.session, `${base(w.org)}/invitations`, {
            email: 'x@example.com',
            roles: ['VIEWER'],
          })
        ).status,
      ).toBe(403);
      expect((await post(m.session, `${memberPath(w.entry)}/suspend`)).status).toBe(403);
      expect((await patch(m.session, memberPath(w.entry), { roles: ['VIEWER'] })).status).toBe(403);
    }
    expect((await request(app).get(membersPath())).status).toBe(401);
  });

  it('isolates organisations: another organisation’s members and invitations are not found', async () => {
    const invited = await post(w.owner.session, `${base(w.org)}/invitations`, {
      email: 'new@example.com',
      roles: ['VIEWER'],
    });
    expect(invited.status).toBe(201);
    const invitationId = (invited.body.data as InvitationDto).id;

    const b = w.ownerB.session;
    expect((await b.agent.get(membersPath())).status).toBe(404);
    expect((await b.agent.get(`${base(w.org)}/invitations`)).status).toBe(404);
    // Organisation A's ids through organisation B's path.
    expect(
      (await patch(b, `${base(w.orgB)}/members/${w.entry.membership.id}`, { roles: ['VIEWER'] }))
        .status,
    ).toBe(404);
    expect((await post(b, `${base(w.orgB)}/members/${w.entry.membership.id}/remove`)).status).toBe(
      404,
    );
    expect((await post(b, `${base(w.orgB)}/invitations/${invitationId}/revoke`)).status).toBe(404);
    const listB = (await b.agent.get(`${base(w.orgB)}/members`)).body.data as MemberDto[];
    expect(listB.map((m) => m.email)).toEqual(['owner-b@example.com']);
    expect((await b.agent.get(`${base(w.orgB)}/invitations`)).body.data).toEqual([]);
  });

  it('validates input and rejects unknown fields', async () => {
    const s = w.owner.session;
    for (const body of [
      { roles: [] },
      { roles: ['GOD'] },
      { roles: ['VIEWER'], status: 'ACTIVE' },
    ]) {
      const res = await patch(s, memberPath(w.entry), body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await patch(s, `${membersPath()}/not-a-uuid`, { roles: ['VIEWER'] })).status).toBe(400);
    expect(
      (await post(s, `${base(w.org)}/invitations`, { email: 'nope', roles: ['VIEWER'] })).status,
    ).toBe(400);
  });
});

describe('changing roles', () => {
  it('changes roles and audits the change', async () => {
    const res = await patch(w.admin.session, memberPath(w.entry), {
      roles: ['REVIEWER', 'DATA_ENTRY_OFFICER', 'REVIEWER'],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.roles).toEqual(['REVIEWER', 'DATA_ENTRY_OFFICER']);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'membership.roles_changed' },
    });
    expect(audit).toMatchObject({
      organisationId: w.org,
      actorUserId: w.admin.user.id,
      entityId: w.entry.membership.id,
      metadata: {
        userId: w.entry.user.id,
        fromRoles: ['DATA_ENTRY_OFFICER'],
        toRoles: ['REVIEWER', 'DATA_ENTRY_OFFICER'],
      },
    });
  });

  it('lets only an Owner grant the Owner role, by role change or invitation', async () => {
    const grant = await patch(w.admin.session, memberPath(w.entry), {
      roles: ['ORGANISATION_OWNER'],
    });
    expect(grant.status).toBe(403);
    expect(grant.body.error.code).toBe('OWNER_ONLY');
    const inviteOwner = await post(w.admin.session, `${base(w.org)}/invitations`, {
      email: 'boss@example.com',
      roles: ['ORGANISATION_OWNER'],
    });
    expect(inviteOwner.status).toBe(403);
    expect(inviteOwner.body.error.code).toBe('OWNER_ONLY');

    const byOwner = await patch(w.owner.session, memberPath(w.entry), {
      roles: ['ORGANISATION_OWNER', 'DATA_ENTRY_OFFICER'],
    });
    expect(byOwner.status).toBe(200);
    expect(
      (
        await post(w.owner.session, `${base(w.org)}/invitations`, {
          email: 'boss@example.com',
          roles: ['ORGANISATION_OWNER'],
        })
      ).status,
    ).toBe(201);
  });

  it('lets an Administrator manage Owners, but not give the Owner role back', async () => {
    // Keeping the Owner role while adding another is not a grant.
    const keep = await patch(w.admin.session, memberPath(w.owner2), {
      roles: ['ORGANISATION_OWNER', 'REVIEWER'],
    });
    expect(keep.status).toBe(200);
    const demote = await patch(w.admin.session, memberPath(w.owner2), { roles: ['VIEWER'] });
    expect(demote.status).toBe(200);
    expect(demote.body.data.roles).toEqual(['VIEWER']);
    const regrant = await patch(w.admin.session, memberPath(w.owner2), {
      roles: ['ORGANISATION_OWNER'],
    });
    expect(regrant.status).toBe(403);
    expect(regrant.body.error.code).toBe('OWNER_ONLY');

    const suspended = await post(w.admin.session, `${memberPath(w.owner)}/suspend`);
    expect(suspended.status).toBe(200);
    expect(suspended.body.data.status).toBe('SUSPENDED');
    const reinstated = await post(w.admin.session, `${memberPath(w.owner)}/reinstate`);
    expect(reinstated.body.data).toMatchObject({ status: 'ACTIVE', roles: ['ORGANISATION_OWNER'] });
  });

  it('never lets anyone change, suspend or remove themselves', async () => {
    for (const m of [w.owner, w.admin]) {
      for (const res of [
        await patch(m.session, memberPath(m), { roles: ['VIEWER'] }),
        await post(m.session, `${memberPath(m)}/suspend`),
        await post(m.session, `${memberPath(m)}/remove`),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('SELF_MEMBERSHIP_CHANGE');
      }
    }
  });

  it('lets an Administrator suspend, demote or remove the last Owner: the organisation becomes dormant', async () => {
    const org = () => w.viewer.session.agent.get(base(w.org));
    expect((await org()).body.data.dormant).toBe(false);

    // Remove one Owner; another is left, so the organisation is not dormant.
    const first = await post(w.admin.session, `${memberPath(w.owner2)}/remove`);
    expect(first.status).toBe(200);
    const firstAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'membership.removed', entityId: w.owner2.membership.id },
    });
    expect(firstAudit.metadata).not.toHaveProperty('organisationDormant');

    // Suspending the last active Owner makes it dormant, and the audit entry says so.
    const suspended = await post(w.admin.session, `${memberPath(w.owner)}/suspend`);
    expect(suspended.status).toBe(200);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'membership.suspended', entityId: w.owner.membership.id },
    });
    expect(audit.metadata).toMatchObject({ organisationDormant: true });
    const dormant = await org();
    expect(dormant.status).toBe(200);
    expect(dormant.body.data).toMatchObject({ id: w.org, dormant: true, roles: ['VIEWER'] });

    // Members carry on as before.
    expect((await w.admin.session.agent.get(membersPath())).status).toBe(200);
    expect((await w.viewer.session.agent.get(`${base(w.org)}/activity-records`)).status).toBe(200);

    // Reinstating the Owner revives it; demoting the last Owner makes it dormant again.
    await post(w.admin.session, `${memberPath(w.owner)}/reinstate`);
    expect((await org()).body.data.dormant).toBe(false);
    const demoted = await patch(w.admin.session, memberPath(w.owner), { roles: ['ADMINISTRATOR'] });
    expect(demoted.status).toBe(200);
    expect((await org()).body.data.dormant).toBe(true);
    const demoteAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'membership.roles_changed', entityId: w.owner.membership.id },
    });
    expect(demoteAudit.metadata).toMatchObject({ organisationDormant: true });
  });

  it('lets an Administrator remove the last Owner', async () => {
    await post(w.admin.session, `${memberPath(w.owner2)}/remove`).expect(200);
    const res = await post(w.admin.session, `${memberPath(w.owner)}/remove`);
    expect(res.status).toBe(200);
    expect(res.body.data.member.status).toBe('REMOVED');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'membership.removed', entityId: w.owner.membership.id },
    });
    expect(audit.metadata).toMatchObject({ organisationDormant: true });
    expect((await w.viewer.session.agent.get(base(w.org))).body.data.dormant).toBe(true);
  });

  it('decides on the caller’s current roles, not the ones they had when the request began', async () => {
    // owner2 loses every managing role; their existing session can no longer manage members.
    expect((await patch(w.owner.session, memberPath(w.owner2), { roles: ['VIEWER'] })).status).toBe(
      200,
    );
    const res = await post(w.owner2.session, `${memberPath(w.owner)}/suspend`);
    expect(res.status).toBe(403);
  });
});

describe('suspending and reinstating', () => {
  it('blocks a suspended member on their next request, and reinstating restores access', async () => {
    const viewer = w.viewer.session;
    expect((await viewer.agent.get(base(w.org))).status).toBe(200);

    const suspended = await post(w.admin.session, `${memberPath(w.viewer)}/suspend`);
    expect(suspended.status).toBe(200);
    expect(suspended.body.data.status).toBe('SUSPENDED');
    expect((await viewer.agent.get(base(w.org))).status).toBe(404);
    // The account itself stays usable.
    expect((await viewer.agent.get(`${API}/auth/session`)).status).toBe(200);

    expect((await post(w.admin.session, `${memberPath(w.viewer)}/suspend`)).status).toBe(409);
    const reinstated = await post(w.admin.session, `${memberPath(w.viewer)}/reinstate`);
    expect(reinstated.body.data.status).toBe('ACTIVE');
    expect((await viewer.agent.get(base(w.org))).status).toBe(200);

    const actions = await prisma.auditLog.findMany({
      where: { entityId: w.viewer.membership.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(actions.map((a) => a.action)).toEqual(['membership.suspended', 'membership.reinstated']);
  });

  it('refuses to invite a suspended member and tells the inviter to reinstate them', async () => {
    await post(w.admin.session, `${memberPath(w.viewer)}/suspend`);
    const res = await post(w.admin.session, `${base(w.org)}/invitations`, {
      email: 'viewer@example.com',
      roles: ['VIEWER'],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEMBER_SUSPENDED');
    expect(res.body.error.message).toMatch(/reinstate/i);
    const active = await post(w.admin.session, `${base(w.org)}/invitations`, {
      email: 'entry@example.com',
      roles: ['VIEWER'],
    });
    expect(active.status).toBe(409);
    expect(active.body.error.code).toBe('ALREADY_MEMBER');
  });
});

describe('removing members', () => {
  async function hierarchy(user: LoggedIn) {
    const f = await post(user, `${base(w.org)}/facilities`, { name: 'F', code: 'F-1' });
    const a = await post(user, `${base(w.org)}/assets`, {
      facilityId: f.body.data.id,
      name: 'A',
      code: 'A-1',
    });
    const s = await post(user, `${base(w.org)}/flare-sources`, {
      assetId: a.body.data.id,
      name: 'S',
      code: 'S-1',
    });
    return s.body.data.id as string;
  }

  async function record(source: string, day: string) {
    const res = await post(w.entry.session, `${base(w.org)}/activity-records`, {
      flareSourceId: source,
      kind: 'DAILY',
      periodStart: day,
      activityType: 'ROUTINE_FLARING',
      totalVolume: { value: '20', unit: 'MMSCF' },
      referenceTemperature: { value: '15', unit: 'CELSIUS' },
      referencePressure: { value: '101.325', unit: 'KPA_ABS' },
      measurementBasis: 'MEASURED',
      measurementMethod: 'METERED',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return `${base(w.org)}/activity-records/${res.body.data.id as string}`;
  }

  async function step(user: LoggedIn, path: string, action: string) {
    const res = await post(user, `${path}/${action}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }

  it('releases the member’s review claims, disables an account left with no membership and ends its sessions', async () => {
    const admin = await createUser('platform@example.com', { isPlatformAdmin: true });
    await approvedMethodology(admin.id);
    const reviewer2 = await member('reviewer2@example.com', w.org, ['REVIEWER']);
    const source = await hierarchy(w.owner.session);

    // A record under review by `reviewer`.
    const claimedRecord = await record(source, '2026-03-01');
    await step(w.entry.session, claimedRecord, 'submit');
    await step(w.reviewer.session, claimedRecord, 'start-review');

    // An approved record whose calculation is under review by `reviewer`.
    const approved = await record(source, '2026-03-02');
    await step(w.entry.session, approved, 'submit');
    await step(reviewer2.session, approved, 'start-review');
    await step(reviewer2.session, approved, 'forward');
    await step(w.approver.session, approved, 'approve');
    const calc = await post(w.entry.session, `${approved}/calculations`, {
      route: 'IPCC_REFERENCE_FLARING',
      fallbackReason: 'No analysis yet',
    });
    expect(calc.status, JSON.stringify(calc.body)).toBe(201);
    const calcPath = `${base(w.org)}/calculations/${calc.body.data.id as string}`;
    await step(w.entry.session, calcPath, 'submit');
    await step(w.reviewer.session, calcPath, 'start-review');

    const removed = await post(w.admin.session, `${memberPath(w.reviewer)}/remove`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(removed.body.data).toMatchObject({
      member: { status: 'REMOVED' },
      releasedClaims: { activityRecords: 1, calculations: 1 },
      accountDisabled: true,
    });

    const recordNow = (await w.owner.session.agent.get(claimedRecord)).body.data;
    expect(recordNow).toMatchObject({ status: 'SUBMITTED', claim: null });
    const history = (await w.owner.session.agent.get(`${claimedRecord}/history`)).body.data;
    expect(history.at(-1)).toMatchObject({
      type: 'CLAIM_RELEASED',
      fromStatus: 'UNDER_REVIEW',
      toStatus: 'SUBMITTED',
      comment: expect.stringMatching(/removed from the organisation/),
    });
    const calcNow = (await w.owner.session.agent.get(calcPath)).body.data;
    expect(calcNow).toMatchObject({ status: 'SUBMITTED', claim: null });

    // The account is disabled and its existing session no longer works.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: w.reviewer.user.id } });
    expect(user.status).toBe('DISABLED');
    expect((await w.reviewer.session.agent.get(`${API}/auth/session`)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    // The membership row is kept.
    expect(
      await prisma.membership.findUniqueOrThrow({ where: { id: w.reviewer.membership.id } }),
    ).toMatchObject({ status: 'REMOVED' });

    const actions = (
      await prisma.auditLog.findMany({ where: { organisationId: w.org }, select: { action: true } })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'membership.removed',
        'activity_record.claim_released',
        'calculation.release_claim',
        'user.disabled',
      ]),
    );

    // Removed members are left out of the list unless asked for.
    const list = (await w.admin.session.agent.get(membersPath())).body.data as MemberDto[];
    expect(list.map((m) => m.email)).not.toContain('reviewer@example.com');
    const all = (await w.admin.session.agent.get(`${membersPath()}?includeRemoved=true`)).body
      .data as MemberDto[];
    expect(all.find((m) => m.email === 'reviewer@example.com')?.status).toBe('REMOVED');
    expect((await post(w.admin.session, `${memberPath(w.reviewer)}/remove`)).status).toBe(409);
  });

  it('keeps the account enabled when the person still belongs to another organisation', async () => {
    await addMember(w.viewer.user.id, w.orgB, ['VIEWER']);
    const res = await post(w.owner.session, `${memberPath(w.viewer)}/remove`);
    expect(res.body.data.accountDisabled).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: w.viewer.user.id } });
    expect(user.status).toBe('ACTIVE');
    expect((await w.viewer.session.agent.get(base(w.org))).status).toBe(404);
    expect((await w.viewer.session.agent.get(base(w.orgB))).status).toBe(200);
  });

  it('lets a removed member be invited again; accepting reactivates the same membership', async () => {
    await post(w.owner.session, `${memberPath(w.viewer)}/remove`);
    const invited = await post(w.owner.session, `${base(w.org)}/invitations`, {
      email: 'viewer@example.com',
      roles: ['APPROVER'],
    });
    expect(invited.status).toBe(201);
    const token = await inviteTokenFor('viewer@example.com');

    // The account was disabled; giving its password re-enables it.
    const accepted = await request(app)
      .post(`${API}/invitations/accept`)
      .send({ token, password: 'Correct-Horse-Battery-1' });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    const memberships = await prisma.membership.findMany({ where: { userId: w.viewer.user.id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      id: w.viewer.membership.id,
      status: 'ACTIVE',
      roles: ['APPROVER'],
    });
    expect(await prisma.auditLog.count({ where: { action: 'membership.reactivated' } })).toBe(1);
  });
});

describe('an inviter who loses the authority to invite', () => {
  async function inviteAs(m: Member, email: string, roles: Role[] = ['VIEWER']) {
    const res = await post(m.session, `${base(w.org)}/invitations`, { email, roles });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  }

  async function expectRevoked(id: string, reason: string) {
    const inv = await prisma.invitation.findUniqueOrThrow({ where: { id } });
    expect(inv.status).toBe('REVOKED');
    const email = await prisma.emailOutbox.findFirstOrThrow({ where: { invitationId: id } });
    expect(email.status).toBe('CANCELLED');
    expect(email.payload).not.toHaveProperty('link');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'invitation.revoked', entityId: id },
    });
    expect(audit.metadata).toMatchObject({ reason });
  }

  async function expectPending(id: string) {
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
  }

  it('loses all their pending invitations when removed', async () => {
    const a = await inviteAs(w.admin, 'a@example.com');
    const b = await inviteAs(w.admin, 'b@example.com', ['REVIEWER']);
    const other = await inviteAs(w.owner, 'c@example.com');
    await post(w.owner.session, `${memberPath(w.admin)}/remove`).expect(200);
    await expectRevoked(a, 'inviter_removed');
    await expectRevoked(b, 'inviter_removed');
    await expectPending(other);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'invitation.revoked', entityId: a },
    });
    // Revoked by the person who removed the inviter.
    expect(audit.actorUserId).toBe(w.owner.user.id);
  });

  it('loses all their pending invitations when suspended (reinstating does not bring them back)', async () => {
    const a = await inviteAs(w.admin, 'a@example.com');
    await post(w.owner.session, `${memberPath(w.admin)}/suspend`).expect(200);
    await expectRevoked(a, 'inviter_suspended');
    await post(w.owner.session, `${memberPath(w.admin)}/reinstate`).expect(200);
    await expectRevoked(a, 'inviter_suspended');
  });

  it('loses only the Owner invitations they issued when they lose the Owner role', async () => {
    const ownerInvite = await inviteAs(w.owner2, 'boss@example.com', ['ORGANISATION_OWNER']);
    const viewerInvite = await inviteAs(w.owner2, 'staff@example.com');
    await patch(w.owner.session, memberPath(w.owner2), { roles: ['ADMINISTRATOR'] }).expect(200);
    await expectRevoked(ownerInvite, 'inviter_lost_owner_role');
    await expectPending(viewerInvite);
  });

  it('loses all their pending invitations when they can no longer manage members', async () => {
    const a = await inviteAs(w.admin, 'a@example.com');
    await patch(w.owner.session, memberPath(w.admin), { roles: ['VIEWER'] }).expect(200);
    await expectRevoked(a, 'inviter_lost_member_management');
  });
});
