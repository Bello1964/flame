import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { InvitationDto, InvitationLookupDto } from '@flame/shared';
import {
  appPrisma,
  CSRF_HEADER,
  PASSWORD,
  WEB_ORIGIN,
  addMember,
  createOrganisation,
  createUser,
  inviteTokenFor,
  login,
  makeApp,
  ownerPrisma,
  prisma,
  resetDatabase,
  testConfig,
  type LoggedIn,
} from '../../test/context.js';
import { hashToken } from '../auth/session.service.js';
import { withSystemScope } from '../../lib/db-scope.js';
import { InvitationsService } from './invitations.service.js';

const app = makeApp();
const API = '/api/v1';
const NEW_PASSWORD = 'A-brand-new-password-42';

function post(user: LoggedIn, path: string, body: object = {}) {
  return user.agent.post(path).set(CSRF_HEADER, user.csrfToken).send(body);
}

function sessionCookie(setCookie: string[] | string | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.find((c) => c.startsWith('flame_sid='));
}

let org: string;
let owner: LoggedIn;
const invitationsPath = () => `${API}/organisations/${org}/invitations`;

async function invite(email: string, roles: string[] = ['VIEWER']) {
  const res = await post(owner, invitationsPath(), { email, roles });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return {
    invitation: res.body.data as InvitationDto,
    token: await inviteTokenFor(email.trim().toLowerCase()),
  };
}

const publicPost = (path: string, body: object) =>
  request(app).post(`${API}/invitations/${path}`).send(body);

beforeEach(async () => {
  await resetDatabase();
  org = (await createOrganisation('acme')).id;
  const ownerUser = await createUser('owner@example.com');
  await addMember(ownerUser.id, org, ['ORGANISATION_OWNER']);
  owner = await login(app, 'owner@example.com');
});

describe('creating invitations', () => {
  it('stores only the token hash and queues the email in the same transaction', async () => {
    const { invitation, token } = await invite('  New@Example.com ', ['REVIEWER', 'VIEWER']);
    expect(invitation).toMatchObject({
      kind: 'ORGANISATION',
      organisationId: org,
      email: 'new@example.com',
      roles: ['REVIEWER', 'VIEWER'],
      status: 'PENDING',
      invitedBy: { name: 'owner' },
      delivery: 'QUEUED',
      respondedAt: null,
      revokedAt: null,
    });
    const days = (Date.parse(invitation.expiresAt) - Date.parse(invitation.createdAt)) / 86_400_000;
    expect(days).toBeCloseTo(5, 5);

    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    const outbox = await prisma.emailOutbox.findMany({ where: { invitationId: invitation.id } });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      recipient: 'new@example.com',
      template: 'ORGANISATION_INVITATION',
      status: 'PENDING',
      payload: {
        inviterName: 'owner',
        organisationName: 'Test acme',
        roles: ['REVIEWER', 'VIEWER'],
        link: `${WEB_ORIGIN}/invite/${token}`,
      },
    });
    // The token never reaches the audit log.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'invitation.created' },
    });
    expect(audit).toMatchObject({ organisationId: org, entityId: invitation.id });
    expect(JSON.stringify(audit)).not.toContain(token);
  });

  it('allows one valid invitation per email: revoke first, then invite again', async () => {
    const first = await invite('new@example.com');
    const again = await post(owner, invitationsPath(), {
      email: 'new@example.com',
      roles: ['APPROVER'],
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVITATION_PENDING');
    // Nothing was written by the refused request.
    expect(await prisma.invitation.count()).toBe(1);
    expect(await prisma.emailOutbox.count()).toBe(1);

    const revoked = await post(owner, `${invitationsPath()}/${first.invitation.id}/revoke`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data).toMatchObject({ status: 'REVOKED', delivery: 'CANCELLED' });
    // The unsent email is cancelled and its link erased.
    const cancelled = await prisma.emailOutbox.findFirstOrThrow({
      where: { invitationId: first.invitation.id },
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.payload).not.toHaveProperty('link');
    expect((await publicPost('lookup', { token: first.token })).body.data.status).toBe('REVOKED');
    expect((await post(owner, `${invitationsPath()}/${first.invitation.id}/revoke`)).status).toBe(
      409,
    );

    const second = await invite('new@example.com', ['APPROVER']);
    expect(second.invitation.roles).toEqual(['APPROVER']);
    const list = (await owner.agent.get(invitationsPath())).body.data as InvitationDto[];
    expect(list.map((i) => i.status).sort()).toEqual(['PENDING', 'REVOKED']);
    expect(await prisma.auditLog.count({ where: { action: { in: ['invitation.revoked'] } } })).toBe(
      1,
    );
  });

  it('treats an expired invitation as expired everywhere and replaces it on re-invite', async () => {
    const token = 'expired-invitation-token-0123456789abcdef';
    const now = Date.now();
    const ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: 'owner@example.com' } }))
      .id;
    const expired = await ownerPrisma.invitation.create({
      data: {
        kind: 'ORGANISATION',
        organisationId: org,
        email: 'late@example.com',
        roles: ['VIEWER'],
        tokenHash: hashToken(token),
        invitedById: ownerId,
        createdAt: new Date(now - 6 * 86_400_000),
        expiresAt: new Date(now - 86_400_000),
      },
    });
    const lookup = await publicPost('lookup', { token });
    expect(lookup.body.data.status).toBe('EXPIRED');
    const accept = await publicPost('accept', { token, name: 'Late', password: NEW_PASSWORD });
    expect(accept.status).toBe(409);
    expect(accept.body.error.code).toBe('INVITATION_EXPIRED');
    expect((await owner.agent.get(invitationsPath())).body.data[0].status).toBe('EXPIRED');

    await invite('late@example.com');
    const old = await prisma.invitation.findUniqueOrThrow({ where: { id: expired.id } });
    expect(old.status).toBe('EXPIRED');
  });
});

describe('looking up an invitation', () => {
  it('describes a valid link and says whether an account exists', async () => {
    const { token } = await invite('new@example.com', ['APPROVER']);
    const res = await publicPost('lookup', { token });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      kind: 'ORGANISATION',
      organisationId: org,
      organisationName: 'Test acme',
      inviterName: 'owner',
      email: 'new@example.com',
      roles: ['APPROVER'],
      expiresAt: expect.any(String),
      status: 'PENDING',
      accountExists: false,
    } satisfies Record<keyof InvitationLookupDto, unknown>);

    await createUser('existing@example.com');
    const second = await invite('existing@example.com');
    expect((await publicPost('lookup', { token: second.token })).body.data.accountExists).toBe(
      true,
    );
  });

  it('gives a generic 404 for an unknown token and validates the body', async () => {
    const res = await publicPost('lookup', { token: 'x'.repeat(43) });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('This invitation link is not valid');
    expect((await publicPost('lookup', {})).status).toBe(400);
    expect((await publicPost('lookup', { token: 'x'.repeat(43), extra: 1 })).status).toBe(400);
  });
});

describe('accepting as a new user', () => {
  it('creates the account and membership, and signs in exactly like login', async () => {
    const { token } = await invite('new@example.com', ['REVIEWER']);
    const agent = request.agent(app);
    const res = await agent
      .post(`${API}/invitations/accept`)
      .send({ token, name: 'Ngozi Okafor', password: NEW_PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const cookie = sessionCookie(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body.data).toMatchObject({
      user: { email: 'new@example.com', name: 'Ngozi Okafor', isPlatformAdmin: false },
      memberships: [{ organisationId: org, roles: ['REVIEWER'] }],
      csrfToken: expect.any(String),
    });
    expect((await agent.get(`${API}/auth/session`)).status).toBe(200);
    // The new password works for sign-in.
    await login(app, 'new@example.com', NEW_PASSWORD);

    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'user.created',
        'membership.created',
        'invitation.accepted',
        'auth.login_succeeded',
      ]),
    );
    // Single use.
    const again = await publicPost('accept', { token, name: 'X', password: NEW_PASSWORD });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVITATION_NOT_PENDING');
  });

  it('needs a name and a password of at least 12 characters', async () => {
    const { token } = await invite('new@example.com');
    const res = await publicPost('accept', { token, password: 'short' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fieldErrors).sort()).toEqual(['name', 'password']);
    expect(await prisma.user.count({ where: { email: 'new@example.com' } })).toBe(0);
  });

  it('can be used only once, even by simultaneous requests', async () => {
    const { token } = await invite('new@example.com');
    const results = await Promise.all(
      [1, 2, 3].map(() => publicPost('accept', { token, name: 'Racer', password: NEW_PASSWORD })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await prisma.user.count({ where: { email: 'new@example.com' } })).toBe(1);
    expect(await prisma.membership.count({ where: { organisationId: org } })).toBe(2);
  });
});

describe('accepting with an existing account', () => {
  beforeEach(async () => {
    await createUser('existing@example.com');
  });

  it('requires signing in as the invited email', async () => {
    const { token } = await invite('existing@example.com');
    const anonymous = await publicPost('accept', { token });
    expect(anonymous.status).toBe(403);
    expect(anonymous.body.error.code).toBe('INVITATION_SIGN_IN_REQUIRED');

    await createUser('someone-else@example.com');
    const other = await login(app, 'someone-else@example.com');
    const wrong = await post(other, `${API}/invitations/accept`, { token });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('INVITATION_WRONG_ACCOUNT');
    expect(wrong.body.error.message).toContain('existing@example.com');

    const right = await login(app, 'existing@example.com');
    const ok = await post(right, `${API}/invitations/accept`, { token });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    // The current session carries on: no new cookie, same CSRF token.
    expect(sessionCookie(ok.headers['set-cookie'])).toBeUndefined();
    expect(ok.body.data.csrfToken).toBe(right.csrfToken);
    expect(ok.body.data.memberships).toMatchObject([{ organisationId: org }]);
  });

  it('requires the CSRF token when the request carries a session, and rejects a foreign Origin', async () => {
    const { token } = await invite('existing@example.com');
    const signedIn = await login(app, 'existing@example.com');
    const noToken = await signedIn.agent.post(`${API}/invitations/accept`).send({ token });
    expect(noToken.status).toBe(403);
    expect(noToken.body.error.code).toBe('CSRF_REJECTED');
    const foreign = await request(app)
      .post(`${API}/invitations/accept`)
      .set('Origin', 'https://evil.example')
      .send({ token, password: PASSWORD });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('CSRF_REJECTED');
  });

  it('accepts with the account’s password and opens a session', async () => {
    const { token } = await invite('existing@example.com');
    const wrong = await publicPost('accept', { token, password: 'not-the-password' });
    expect(wrong.status).toBe(401);
    const res = await publicPost('accept', { token, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(sessionCookie(res.headers['set-cookie'])).toBeDefined();
  });

  it('re-enables a disabled account that accepts with its password', async () => {
    await prisma.user.update({
      where: { email: 'existing@example.com' },
      data: { status: 'DISABLED' },
    });
    const { token } = await invite('existing@example.com');
    const res = await publicPost('accept', { token, password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'existing@example.com' } });
    expect(user.status).toBe('ACTIVE');
    expect(await prisma.auditLog.count({ where: { action: 'user.reenabled' } })).toBe(1);
    await login(app, 'existing@example.com');
  });
});

describe('declining', () => {
  it('needs no account, and the link can no longer be accepted', async () => {
    const { invitation, token } = await invite('new@example.com');
    const res = await publicPost('decline', { token });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DECLINED');
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.respondedAt).not.toBeNull();
    const accept = await publicPost('accept', { token, name: 'N', password: NEW_PASSWORD });
    expect(accept.status).toBe(409);
    expect((await publicPost('decline', { token })).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: 'invitation.declined' } })).toBe(1);
  });
});

describe('rate limiting', () => {
  it('limits failed requests per client IP across the public invitation endpoints', async () => {
    const limited = makeApp({
      config: {
        ...testConfig,
        loginRateLimit: {
          windowMs: 60_000,
          maxPerIp: 3,
          maxPerAccountIp: 1_000,
          maxPerAccount: 1_000,
        },
      },
    });
    const bad = (path: string) =>
      request(limited)
        .post(`${API}/invitations/${path}`)
        .send({ token: 'y'.repeat(43) });
    expect((await bad('lookup')).status).toBe(404);
    expect((await bad('decline')).status).toBe(404);
    expect((await bad('accept')).status).toBe(404);
    const blocked = await bad('lookup');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('accepting while signed in', () => {
  it('replaces the session of a different account when the invited account’s password is given', async () => {
    await createUser('existing@example.com');
    await createUser('someone-else@example.com');
    const { token } = await invite('existing@example.com');
    const other = await login(app, 'someone-else@example.com');
    const otherUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'someone-else@example.com' },
    });

    const res = await post(other, `${API}/invitations/accept`, { token, password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(sessionCookie(res.headers['set-cookie'])).toBeDefined();
    expect(res.body.data.user.email).toBe('existing@example.com');
    // The other account's session was ended, and the agent now holds the new one.
    const otherSessions = await prisma.session.findMany({ where: { userId: otherUser.id } });
    expect(otherSessions.every((s) => s.revokedAt !== null)).toBe(true);
    const now = await other.agent.get(`${API}/auth/session`);
    expect(now.body.data.user.email).toBe('existing@example.com');
  });

  it('never re-enables a disabled account or uses an ended session in signed-in mode', async () => {
    const user = await createUser('existing@example.com');
    const { token } = await invite('existing@example.com');
    await login(app, 'existing@example.com');
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    // Production runs the service unscoped behind the router's system scope; do the same.
    const service = new InvitationsService(appPrisma, WEB_ORIGIN);
    const signedIn = { userId: user.id, sessionId: session.id };
    const accept = () =>
      withSystemScope('invitation-link', () => service.accept({ token }, signedIn, null));

    // Disabled between authentication and the transaction: refused, still disabled.
    await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
    await expect(accept()).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe(
      'DISABLED',
    );
    expect(await prisma.auditLog.count({ where: { action: 'user.reenabled' } })).toBe(0);

    // An ended session is refused too.
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await expect(accept()).rejects.toMatchObject({ status: 401 });
    expect((await publicPost('lookup', { token })).body.data.status).toBe('PENDING');
  });
});

describe('per-account sign-in limits on password acceptance', () => {
  const limitedConfig = {
    ...testConfig,
    loginRateLimit: { windowMs: 60_000, maxPerIp: 1_000, maxPerAccountIp: 2, maxPerAccount: 1_000 },
  };

  it('counts wrong passwords on invitations against the account, shared with sign-in', async () => {
    const user = await createUser('existing@example.com');
    const { token } = await invite('existing@example.com');
    const limited = makeApp({ config: limitedConfig });
    const accept = (password: string) =>
      request(limited).post(`${API}/invitations/accept`).send({ token, password });
    expect((await accept('wrong-1')).status).toBe(401);
    expect((await accept('wrong-2')).status).toBe(401);
    const blocked = await accept(PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    // Sign-in for the same account from the same address is blocked as well.
    const signIn = await request(limited)
      .post(`${API}/auth/login`)
      .send({ email: 'existing@example.com', password: PASSWORD });
    expect(signIn.status).toBe(429);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.login_rate_limited' },
    });
    expect(audit).toMatchObject({ entityId: user.id, metadata: { limit: 'account_ip' } });
    expect((await publicPost('lookup', { token })).body.data.status).toBe('PENDING');
  });

  it('counts failed sign-ins against password acceptance', async () => {
    await createUser('existing@example.com');
    const { token } = await invite('existing@example.com');
    const limited = makeApp({ config: limitedConfig });
    for (let i = 0; i < 2; i++) {
      const res = await request(limited)
        .post(`${API}/auth/login`)
        .send({ email: 'existing@example.com', password: 'guess' });
      expect(res.status).toBe(401);
    }
    const res = await request(limited)
      .post(`${API}/invitations/accept`)
      .send({ token, password: PASSWORD });
    expect(res.status).toBe(429);
  });

  it('does not limit acceptance that checks no password', async () => {
    const { token } = await invite('new@example.com');
    const limited = makeApp({
      config: {
        ...limitedConfig,
        loginRateLimit: { ...limitedConfig.loginRateLimit, maxPerAccountIp: 1 },
      },
    });
    for (let i = 0; i < 3; i++) {
      expect(
        (await request(limited).post(`${API}/invitations/accept`).send({ token })).status,
      ).toBe(400);
    }
    const ok = await request(limited)
      .post(`${API}/invitations/accept`)
      .send({ token, name: 'New', password: NEW_PASSWORD });
    expect(ok.status).toBe(200);
  });
});

describe('concurrency', () => {
  it('lets only one of a simultaneous revoke and accept succeed', async () => {
    const { invitation, token } = await invite('new@example.com');
    const [revoked, accepted] = await Promise.all([
      post(owner, `${invitationsPath()}/${invitation.id}/revoke`),
      publicPost('accept', { token, name: 'Racer', password: NEW_PASSWORD }),
    ]);
    expect([revoked.status, accepted.status].sort()).toEqual([200, 409]);
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    const user = await prisma.user.findUnique({ where: { email: 'new@example.com' } });
    if (revoked.status === 200) {
      expect(stored.status).toBe('REVOKED');
      expect(user).toBeNull();
    } else {
      expect(stored.status).toBe('ACCEPTED');
      expect(user).not.toBeNull();
    }
  });
});

describe('database protection', () => {
  it('never deletes invitations, keeps what was offered and freezes final states', async () => {
    const { invitation, token } = await invite('new@example.com');
    await expect(prisma.invitation.delete({ where: { id: invitation.id } })).rejects.toThrow(
      /permission denied/i,
    );
    await expect(ownerPrisma.invitation.delete({ where: { id: invitation.id } })).rejects.toThrow(
      /never deleted/,
    );
    for (const data of [
      { email: 'other@example.com' },
      { roles: { set: ['ORGANISATION_OWNER' as const] } },
      { expiresAt: new Date(Date.now() + 30 * 86_400_000) },
      { issuedByPlatform: true },
    ]) {
      await expect(
        ownerPrisma.invitation.update({ where: { id: invitation.id }, data }),
      ).rejects.toThrow();
    }
    await expect(
      ownerPrisma.invitation.create({
        data: {
          kind: 'ORGANISATION',
          organisationId: org,
          email: 'x@example.com',
          roles: ['VIEWER'],
          tokenHash: hashToken('another-token-0123456789abcdefghij'),
          invitedById: invitation.invitedBy.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          status: 'ACCEPTED',
        },
      }),
    ).rejects.toThrow(/start as PENDING/);

    await publicPost('accept', { token, name: 'N', password: NEW_PASSWORD }).expect(200);
    await expect(
      ownerPrisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'REVOKED', revokedAt: new Date(), revokedById: invitation.invitedBy.id },
      }),
    ).rejects.toThrow(/cannot change/);
  });

  it('never deletes memberships, even as the schema owner', async () => {
    const membership = await prisma.membership.findFirstOrThrow({ where: { organisationId: org } });
    await expect(prisma.membership.delete({ where: { id: membership.id } })).rejects.toThrow(
      /permission denied/i,
    );
    await expect(ownerPrisma.membership.delete({ where: { id: membership.id } })).rejects.toThrow(
      /never deleted/,
    );
  });
});
