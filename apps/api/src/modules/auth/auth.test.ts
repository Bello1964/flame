import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  CSRF_HEADER,
  PASSWORD,
  WEB_ORIGIN,
  addMember,
  createOrganisation,
  createUser,
  login,
  makeApp,
  prisma,
  resetDatabase,
  testConfig,
} from '../../test/context.js';
import { hashToken } from './session.service.js';

const app = makeApp();

beforeEach(async () => {
  await resetDatabase();
});

function sessionCookie(setCookie: string[] | string | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = cookies.find((c) => c.startsWith('carbon_sid='));
  if (!cookie) throw new Error('No session cookie set');
  return cookie;
}

describe('POST /auth/login', () => {
  it('signs in, sets a hardened cookie and returns memberships and a CSRF token', async () => {
    const user = await createUser('ada@example.com');
    const org = await createOrganisation('acme');
    await addMember(user.id, org.id, ['ORGANISATION_OWNER']);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: '  ADA@Example.com ', password: PASSWORD });

    expect(res.status).toBe(200);
    const cookie = sessionCookie(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(res.body.data.user).toEqual({
      id: user.id,
      email: 'ada@example.com',
      name: 'ada',
      isPlatformAdmin: false,
    });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.memberships).toEqual([
      {
        organisationId: org.id,
        organisationName: 'Test acme',
        organisationSlug: 'acme',
        roles: ['ORGANISATION_OWNER'],
      },
    ]);
    expect(res.body.data.csrfToken).toEqual(expect.any(String));

    // Only the hash of the cookie token is stored.
    const token = decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
    const stored = await prisma.session.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).toBe(hashToken(token));
    expect(stored[0]!.tokenHash).not.toBe(token);

    const audit = await prisma.auditLog.findMany({ where: { action: 'auth.login_succeeded' } });
    expect(audit).toHaveLength(1);
  });

  it('gives the same generic 401 for a wrong password and an unknown email', async () => {
    await createUser('ada@example.com');
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: 'nope' });
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'nope' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.headers['set-cookie']).toBeUndefined();

    const failures = await prisma.auditLog.count({ where: { action: 'auth.login_failed' } });
    expect(failures).toBe(2);
  });

  it('audits failed attempts against the targeted account without naming it as the actor', async () => {
    const ada = await createUser('ada@example.com');
    const off = await createUser('off@example.com', { status: 'DISABLED' });
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: 'wrong' });
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'off@example.com', password: PASSWORD });
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' });

    const failures = await prisma.auditLog.findMany({
      where: { action: 'auth.login_failed' },
      select: { actorUserId: true, entityType: true, entityId: true, metadata: true },
    });
    // The person attempting to sign in is unauthenticated: there is never an actor.
    expect(failures.every((f) => f.actorUserId === null)).toBe(true);
    expect(failures).toEqual(
      expect.arrayContaining([
        {
          actorUserId: null,
          entityType: 'User',
          entityId: ada.id,
          metadata: { reason: 'bad_password' },
        },
        {
          actorUserId: null,
          entityType: 'User',
          entityId: off.id,
          metadata: { reason: 'user_disabled' },
        },
        {
          actorUserId: null,
          entityType: 'User',
          entityId: null,
          metadata: { reason: 'unknown_email' },
        },
      ]),
    );
  });

  it('rejects a disabled user with the same generic 401', async () => {
    await createUser('off@example.com', { status: 'DISABLED' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'off@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('validates the body and rejects unknown fields', async () => {
    const missing = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.co' });
    const extra = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x', organisationId: 'evil' });
    const badEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'x' });
    for (const res of [missing, extra, badEmail]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects a cross-site Origin (login CSRF)', async () => {
    await createUser('ada@example.com');
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'ada@example.com', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });

  it('accepts the configured web Origin', async () => {
    await createUser('ada@example.com');
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email: 'ada@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('revokes an existing session when signing in again (no session fixation)', async () => {
    await createUser('ada@example.com');
    const { agent } = await login(app, 'ada@example.com');
    const again = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: PASSWORD });
    expect(again.status).toBe(200);

    const sessions = await prisma.session.findMany({ orderBy: { createdAt: 'asc' } });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.revokedAt).not.toBeNull();
    expect(sessions[1]!.revokedAt).toBeNull();
  });

  it('keeps the current session when a sign-in attempt fails', async () => {
    await createUser('ada@example.com');
    const { agent, csrfToken } = await login(app, 'ada@example.com');

    const failed = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'ada@example.com', password: 'mistyped' });
    expect(failed.status).toBe(401);
    expect(failed.headers['set-cookie']).toBeUndefined();

    const session = await agent.get('/api/v1/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.data.csrfToken).toBe(csrfToken);
    expect(await prisma.session.count({ where: { revokedAt: { not: null } } })).toBe(0);
  });

  it('keeps the current session when a sign-in attempt is invalid', async () => {
    await createUser('ada@example.com');
    const { agent } = await login(app, 'ada@example.com');

    const invalid = await agent.post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(invalid.status).toBe(400);
    expect((await agent.get('/api/v1/auth/session')).status).toBe(200);
  });

  it('replaces the session when switching to another account', async () => {
    await createUser('ada@example.com');
    await createUser('grace@example.com');
    const { agent } = await login(app, 'ada@example.com');

    const switched = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'grace@example.com', password: PASSWORD });
    expect(switched.status).toBe(200);

    const now = await agent.get('/api/v1/auth/session');
    expect(now.body.data.user.email).toBe('grace@example.com');
    const ada = await prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
    const adaSessions = await prisma.session.findMany({ where: { userId: ada.id } });
    expect(adaSessions).toHaveLength(1);
    expect(adaSessions[0]!.revokedAt).not.toBeNull();
  });

  it('rate-limits repeated failed attempts', async () => {
    const limited = makeApp({
      config: {
        ...testConfig,
        loginRateLimit: { windowMs: 60_000, maxPerIp: 3, maxPerAccount: 1_000 },
      },
    });
    await createUser('ada@example.com');
    const attempt = () =>
      request(limited)
        .post('/api/v1/auth/login')
        .send({ email: 'ada@example.com', password: 'bad' });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('per-account sign-in rate limit', () => {
  // Behind one trusted proxy, each request appears to come from a different client IP.
  // A fresh app per test, so the in-memory limiter counts never carry over between tests.
  let distributed = makeApp();
  beforeEach(() => {
    distributed = makeApp({
      config: {
        ...testConfig,
        trustProxy: 1,
        loginRateLimit: { windowMs: 60_000, maxPerIp: 1_000, maxPerAccount: 3 },
      },
    });
  });
  let ip = 0;
  const attemptFromNewIp = (email: string, password: string) =>
    request(distributed)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `203.0.113.${++ip}`)
      .send({ email, password });

  it('blocks password guessing against one account spread across many IPs', async () => {
    await createUser('ada@example.com');
    for (let i = 0; i < 3; i++) {
      expect((await attemptFromNewIp('ada@example.com', 'guess')).status).toBe(401);
    }
    const blocked = await attemptFromNewIp('ada@example.com', 'guess');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('counts the account regardless of email case or spacing', async () => {
    await createUser('ada@example.com');
    for (const email of ['ada@example.com', ' ADA@example.com', 'Ada@Example.COM ']) {
      expect((await attemptFromNewIp(email, 'guess')).status).toBe(401);
    }
    expect((await attemptFromNewIp('ada@EXAMPLE.com', 'guess')).status).toBe(429);
  });

  it('does not block other accounts', async () => {
    await createUser('ada@example.com');
    await createUser('grace@example.com');
    for (let i = 0; i < 4; i++) await attemptFromNewIp('ada@example.com', 'guess');
    expect((await attemptFromNewIp('grace@example.com', PASSWORD)).status).toBe(200);
  });

  it('does not count successful sign-ins', async () => {
    await createUser('ada@example.com');
    for (let i = 0; i < 5; i++) {
      expect((await attemptFromNewIp('ada@example.com', PASSWORD)).status).toBe(200);
    }
  });
});

describe('sessions', () => {
  it('GET /auth/session requires a session', async () => {
    const res = await request(app).get('/api/v1/auth/session');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /auth/session returns the current user', async () => {
    await createUser('ada@example.com');
    const { agent, csrfToken } = await login(app, 'ada@example.com');
    const res = await agent.get('/api/v1/auth/session');
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('ada@example.com');
    expect(res.body.data.csrfToken).toBe(csrfToken);
  });

  it('rejects a forged or unknown cookie', async () => {
    const res = await request(app)
      .get('/api/v1/auth/session')
      .set('Cookie', 'carbon_sid=forged-token-value');
    expect(res.status).toBe(401);
  });

  it('expires idle sessions', async () => {
    const user = await createUser('ada@example.com');
    const { agent } = await login(app, 'ada@example.com');
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { lastSeenAt: new Date(Date.now() - testConfig.session.idleTimeoutMs - 1_000) },
    });
    expect((await agent.get('/api/v1/auth/session')).status).toBe(401);
  });

  it('expires sessions past their absolute lifetime', async () => {
    const user = await createUser('ada@example.com');
    const { agent } = await login(app, 'ada@example.com');
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect((await agent.get('/api/v1/auth/session')).status).toBe(401);
  });

  it('ends sessions of a user who is disabled after signing in', async () => {
    const user = await createUser('ada@example.com');
    const { agent } = await login(app, 'ada@example.com');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
    expect((await agent.get('/api/v1/auth/session')).status).toBe(401);
  });
});

describe('logout and CSRF', () => {
  it('requires the CSRF token for logout', async () => {
    await createUser('ada@example.com');
    const { agent } = await login(app, 'ada@example.com');

    const noToken = await agent.post('/api/v1/auth/logout');
    expect(noToken.status).toBe(403);
    expect(noToken.body.error.code).toBe('CSRF_REJECTED');

    const wrongToken = await agent.post('/api/v1/auth/logout').set(CSRF_HEADER, 'wrong');
    expect(wrongToken.status).toBe(403);
  });

  it('logs out, clears the cookie and revokes the session server-side', async () => {
    await createUser('ada@example.com');
    const { agent, csrfToken } = await login(app, 'ada@example.com');

    const res = await agent.post('/api/v1/auth/logout').set(CSRF_HEADER, csrfToken);
    expect(res.status).toBe(204);
    expect(sessionCookie(res.headers['set-cookie'])).toMatch(/Expires=Thu, 01 Jan 1970/);

    const session = await prisma.session.findFirstOrThrow();
    expect(session.revokedAt).not.toBeNull();
    expect((await agent.get('/api/v1/auth/session')).status).toBe(401);
  });

  it('logout-all revokes every session of the user', async () => {
    await createUser('ada@example.com');
    const laptop = await login(app, 'ada@example.com');
    const phone = await login(app, 'ada@example.com');

    const res = await laptop.agent
      .post('/api/v1/auth/logout-all')
      .set(CSRF_HEADER, laptop.csrfToken);
    expect(res.status).toBe(204);
    expect((await phone.agent.get('/api/v1/auth/session')).status).toBe(401);
  });
});

describe('audit log', () => {
  it('is append-only at the database level', async () => {
    await createUser('ada@example.com');
    await login(app, 'ada@example.com');
    const entry = await prisma.auditLog.findFirstOrThrow();

    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow();
  });
});
