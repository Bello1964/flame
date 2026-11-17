import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  appPrisma,
  CSRF_HEADER,
  PASSWORD,
  addMember,
  createOrganisation,
  createUser,
  logger,
  login,
  makeApp,
  prisma,
  resetDatabase,
  testConfig,
} from '../../test/context.js';
import { EmailWorker } from '../email/email-worker.js';
import { InMemorySender } from '../email/senders.js';
import { renderEmail } from '../email/templates.js';
import { hashToken } from './session.service.js';

const app = makeApp();
const API = '/api/v1';
const NEW_PASSWORD = 'A-brand-new-password-42';

beforeEach(async () => {
  await resetDatabase();
});

async function member(email: string, status: 'ACTIVE' | 'DISABLED' = 'ACTIVE') {
  const user = await createUser(email, { status });
  const org = await createOrganisation(email.split('@')[0]!.replace(/[^a-z0-9]/g, ''));
  await addMember(user.id, org.id, ['VIEWER']);
  return user;
}

const requestReset = (email: string, target = app) =>
  request(target).post(`${API}/auth/password-reset/request`).send({ email });

const completeReset = (token: string, password: string) =>
  request(app).post(`${API}/auth/password-reset/complete`).send({ token, password });

/** The request is processed after the 202 is sent, so wait for its link to be queued. */
async function resetTokenFor(email: string, count = 1): Promise<string> {
  let link: string | undefined;
  await vi.waitFor(
    async () => {
      const rows = await prisma.emailOutbox.findMany({
        where: { recipient: email, template: 'PASSWORD_RESET' },
        orderBy: { createdAt: 'desc' },
      });
      expect(rows).toHaveLength(count);
      link = (rows[0]!.payload as { link?: string }).link;
    },
    { timeout: 5_000 },
  );
  const token = link?.split('/reset-password/')[1];
  if (!token) throw new Error(`No reset link queued for ${email}`);
  return token;
}

/** Long enough for a request handled after its response to have finished. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

describe('POST /auth/password-reset/request', () => {
  it('queues a single-use 15-minute link for an active account and audits it', async () => {
    const user = await member('ada@example.com');
    const res = await requestReset('  ADA@example.com ');
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ data: { accepted: true } });

    const token = await resetTokenFor('ada@example.com');
    const reset = await prisma.passwordReset.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(reset).toMatchObject({ userId: user.id, status: 'PENDING', usedAt: null });
    const validityMs = reset.expiresAt.getTime() - reset.createdAt.getTime();
    expect(validityMs).toBe(15 * 60_000);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.password_reset_requested' },
    });
    expect(audit).toMatchObject({ actorUserId: null, entityId: user.id });
    expect(JSON.stringify(audit.metadata)).not.toContain(token);

    const email = await prisma.emailOutbox.findFirstOrThrow({
      where: { template: 'PASSWORD_RESET' },
    });
    const rendered = renderEmail(email.template, email.payload);
    expect(rendered.subject).toBe('Reset your Flame password');
    expect(rendered.text).toContain(`http://localhost:5173/reset-password/${token}`);
  });

  it('answers unknown and disabled emails identically and sends nothing', async () => {
    await member('gone@example.com', 'DISABLED');
    const unknown = await requestReset('nobody@example.com');
    const disabled = await requestReset('gone@example.com');
    expect(unknown.status).toBe(202);
    expect(disabled.status).toBe(202);
    expect(disabled.body).toEqual(unknown.body);
    await settle();
    expect(await prisma.passwordReset.count()).toBe(0);
    expect(await prisma.emailOutbox.count()).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { action: 'auth.password_reset_requested' } }),
    ).toBe(0);
  });

  it('rejects an invalid email with 400', async () => {
    const res = await requestReset('not-an-email');
    expect(res.status).toBe(400);
  });

  it('cancels the previous link and its unsent email when a new one is requested', async () => {
    await member('ada@example.com');
    await requestReset('ada@example.com');
    const first = await resetTokenFor('ada@example.com');
    await requestReset('ada@example.com');
    const second = await resetTokenFor('ada@example.com', 2);
    expect(second).not.toBe(first);

    const old = await prisma.passwordReset.findUniqueOrThrow({
      where: { tokenHash: hashToken(first) },
      include: { emails: true },
    });
    expect(old.status).toBe('CANCELLED');
    expect(old.emails[0]!.status).toBe('CANCELLED');
    expect(old.emails[0]!.payload).not.toHaveProperty('link');

    const res = await completeReset(first, NEW_PASSWORD);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PASSWORD_RESET_INVALID');
    expect((await completeReset(second, NEW_PASSWORD)).status).toBe(204);
  });

  it('limits requests per email address', async () => {
    const limited = makeApp({
      config: {
        ...testConfig,
        loginRateLimit: {
          windowMs: 60_000,
          maxPerIp: 1_000,
          maxPerAccountIp: 2,
          maxPerAccount: 1_000,
        },
      },
    });
    expect((await requestReset('x@example.com', limited)).status).toBe(202);
    expect((await requestReset('X@example.com', limited)).status).toBe(202);
    const blocked = await requestReset('x@example.com', limited);
    expect(blocked.status).toBe(429);
    // Another address is unaffected.
    expect((await requestReset('y@example.com', limited)).status).toBe(202);
  });
});

describe('POST /auth/password-reset/complete', () => {
  it('sets the new password, signs out everywhere, notifies and audits', async () => {
    const user = await member('ada@example.com');
    const session = await login(app, 'ada@example.com');
    await requestReset('ada@example.com');
    const token = await resetTokenFor('ada@example.com');

    const res = await completeReset(token, NEW_PASSWORD);
    expect(res.status).toBe(204);

    // The old session is gone; only the new password signs in.
    expect((await session.agent.get(`${API}/auth/session`)).status).toBe(401);
    const old = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'ada@example.com', password: PASSWORD });
    expect(old.status).toBe(401);
    await login(app, 'ada@example.com', NEW_PASSWORD);

    const reset = await prisma.passwordReset.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(reset.status).toBe('USED');
    expect(reset.usedAt).not.toBeNull();

    const notice = await prisma.emailOutbox.findFirstOrThrow({
      where: { template: 'PASSWORD_CHANGED' },
    });
    expect(notice.recipient).toBe('ada@example.com');
    expect(renderEmail(notice.template, notice.payload).text).toContain(
      'using a password reset link',
    );

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.password_reset_completed' },
    });
    expect(audit).toMatchObject({ entityId: user.id, metadata: { revokedSessions: 1 } });

    // Single use.
    const again = await completeReset(token, 'Another-password-123');
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('PASSWORD_RESET_INVALID');
  });

  it('refuses unknown tokens, short passwords and the current password', async () => {
    await member('ada@example.com');
    await requestReset('ada@example.com');
    const token = await resetTokenFor('ada@example.com');

    const unknown = await completeReset('z'.repeat(43), NEW_PASSWORD);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('PASSWORD_RESET_INVALID');

    const short = await completeReset(token, 'short');
    expect(short.status).toBe(400);
    expect(short.body.error.details.fieldErrors).toHaveProperty('password');

    const same = await completeReset(token, PASSWORD);
    expect(same.status).toBe(400);
    expect(same.body.error.details.fieldErrors.password).toEqual([
      'Choose a password different from your current one',
    ]);

    // None of these used up the link.
    expect((await completeReset(token, NEW_PASSWORD)).status).toBe(204);
  });

  it('limits failed attempts per client IP', async () => {
    const limited = makeApp({
      config: {
        ...testConfig,
        loginRateLimit: {
          windowMs: 60_000,
          maxPerIp: 2,
          maxPerAccountIp: 1_000,
          maxPerAccount: 1_000,
        },
      },
    });
    const attempt = () =>
      request(limited)
        .post(`${API}/auth/password-reset/complete`)
        .send({ token: 'q'.repeat(43), password: NEW_PASSWORD });
    expect((await attempt()).status).toBe(400);
    expect((await attempt()).status).toBe(400);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('refuses an expired link', async () => {
    const user = await member('ada@example.com');
    const token = 'e'.repeat(43);
    const past = Date.now() - 60 * 60_000;
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        createdAt: new Date(past),
        expiresAt: new Date(past + 15 * 60_000),
      },
    });
    const res = await completeReset(token, NEW_PASSWORD);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PASSWORD_RESET_INVALID');
  });

  it('refuses and cancels a link whose account was disabled after it was sent', async () => {
    const user = await member('ada@example.com');
    await requestReset('ada@example.com');
    const token = await resetTokenFor('ada@example.com');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });

    const res = await completeReset(token, NEW_PASSWORD);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PASSWORD_RESET_INVALID');
    const reset = await prisma.passwordReset.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(reset.status).toBe('CANCELLED');
  });

  it('clears the cookie when the signed-in account resets its own password', async () => {
    await member('ada@example.com');
    const session = await login(app, 'ada@example.com');
    await requestReset('ada@example.com');
    const token = await resetTokenFor('ada@example.com');
    const res = await session.agent
      .post(`${API}/auth/password-reset/complete`)
      .set(CSRF_HEADER, session.csrfToken)
      .send({ token, password: NEW_PASSWORD });
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/flame_sid=;/);
  });
});

describe('email worker and reset links', () => {
  it('sends a usable link but never a replaced one', async () => {
    await member('ada@example.com');
    await requestReset('ada@example.com');
    await resetTokenFor('ada@example.com');
    await requestReset('ada@example.com');
    const current = await resetTokenFor('ada@example.com', 2);

    const sender = new InMemorySender();
    const worker = new EmailWorker(appPrisma, sender, logger);
    await worker.runOnce();
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.text).toContain(current);

    const sent = await prisma.emailOutbox.findFirstOrThrow({ where: { status: 'SENT' } });
    expect(sent.payload).not.toHaveProperty('link');
  });

  it('cancels a reset email whose link was used before it left the outbox', async () => {
    await member('ada@example.com');
    await requestReset('ada@example.com');
    const token = await resetTokenFor('ada@example.com');
    // Simulate a link that was used while its email sat in the outbox.
    expect((await completeReset(token, NEW_PASSWORD)).status).toBe(204);

    const sender = new InMemorySender();
    await new EmailWorker(appPrisma, sender, logger).runOnce();
    const resetEmail = await prisma.emailOutbox.findFirstOrThrow({
      where: { template: 'PASSWORD_RESET' },
    });
    expect(resetEmail.status).toBe('CANCELLED');
    expect(sender.sent.map((e) => e.subject)).toEqual(['Your Flame password was changed']);
  });
});

describe('POST /account/password', () => {
  it('changes the password, keeps this session and signs out the others', async () => {
    const user = await member('ada@example.com');
    const here = await login(app, 'ada@example.com');
    const elsewhere = await login(app, 'ada@example.com');

    const res = await here.agent
      .post(`${API}/account/password`)
      .set(CSRF_HEADER, here.csrfToken)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(204);

    expect((await here.agent.get(`${API}/auth/session`)).status).toBe(200);
    expect((await elsewhere.agent.get(`${API}/auth/session`)).status).toBe(401);
    await login(app, 'ada@example.com', NEW_PASSWORD);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.password_changed' },
    });
    expect(audit).toMatchObject({
      actorUserId: user.id,
      metadata: { revokedOtherSessions: 1 },
    });
    const notice = await prisma.emailOutbox.findFirstOrThrow({
      where: { template: 'PASSWORD_CHANGED' },
    });
    expect(renderEmail(notice.template, notice.payload).text).toContain('from the account page');
  });

  it('refuses a wrong current password (audited) and an unchanged password', async () => {
    await member('ada@example.com');
    const s = await login(app, 'ada@example.com');
    const wrong = await s.agent
      .post(`${API}/account/password`)
      .set(CSRF_HEADER, s.csrfToken)
      .send({ currentPassword: 'not-it', newPassword: NEW_PASSWORD });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.fieldErrors.currentPassword).toEqual([
      'The current password is incorrect',
    ]);
    expect(await prisma.auditLog.count({ where: { action: 'auth.password_change_failed' } })).toBe(
      1,
    );

    const same = await s.agent
      .post(`${API}/account/password`)
      .set(CSRF_HEADER, s.csrfToken)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(400);
    expect(same.body.error.details.fieldErrors).toHaveProperty('newPassword');
  });

  it('needs a session and a CSRF token', async () => {
    const anonymous = await request(app)
      .post(`${API}/account/password`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(anonymous.status).toBe(401);

    await member('ada@example.com');
    const s = await login(app, 'ada@example.com');
    const noCsrf = await s.agent
      .post(`${API}/account/password`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(noCsrf.status).toBe(403);
  });

  it('counts wrong current passwords against the per-account sign-in limit', async () => {
    const limited = makeApp({
      config: {
        ...testConfig,
        loginRateLimit: {
          windowMs: 60_000,
          maxPerIp: 1_000,
          maxPerAccountIp: 2,
          maxPerAccount: 1_000,
        },
      },
    });
    await member('ada@example.com');
    const s = await login(limited, 'ada@example.com');
    const attempt = () =>
      s.agent
        .post(`${API}/account/password`)
        .set(CSRF_HEADER, s.csrfToken)
        .send({ currentPassword: 'wrong', newPassword: NEW_PASSWORD });
    expect((await attempt()).status).toBe(400);
    expect((await attempt()).status).toBe(400);
    expect((await attempt()).status).toBe(429);
  });
});

describe('PATCH /account', () => {
  it('changes the name (trimmed) and audits the old and new value', async () => {
    const user = await member('ada@example.com');
    const s = await login(app, 'ada@example.com');
    const res = await s.agent
      .patch(`${API}/account`)
      .set(CSRF_HEADER, s.csrfToken)
      .send({ name: '  Ada Lovelace ' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: user.id,
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      isPlatformAdmin: false,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.name_changed' },
    });
    expect(audit).toMatchObject({
      actorUserId: user.id,
      organisationId: null,
      metadata: { from: 'ada', to: 'Ada Lovelace' },
    });

    // Unchanged: no new audit entry.
    await s.agent
      .patch(`${API}/account`)
      .set(CSRF_HEADER, s.csrfToken)
      .send({ name: 'Ada Lovelace' });
    expect(await prisma.auditLog.count({ where: { action: 'user.name_changed' } })).toBe(1);
  });

  it('lets a Platform Administrator change their name', async () => {
    await createUser('root@example.com', { isPlatformAdmin: true });
    const s = await login(app, 'root@example.com');
    const res = await s.agent
      .patch(`${API}/account`)
      .set(CSRF_HEADER, s.csrfToken)
      .send({ name: 'Platform Root' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Platform Root');
  });

  it('rejects empty, long or extra fields', async () => {
    await member('ada@example.com');
    const s = await login(app, 'ada@example.com');
    const send = (body: object) =>
      s.agent.patch(`${API}/account`).set(CSRF_HEADER, s.csrfToken).send(body);
    expect((await send({ name: '   ' })).status).toBe(400);
    expect((await send({ name: 'x'.repeat(201) })).status).toBe(400);
    expect((await send({ name: 'Ada', email: 'evil@example.com' })).status).toBe(400);
  });
});
