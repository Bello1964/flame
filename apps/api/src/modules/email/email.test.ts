import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  appPrisma,
  CSRF_HEADER,
  addMember,
  createOrganisation,
  createUser,
  inviteTokenFor,
  logger,
  login,
  makeApp,
  prisma,
  resetDatabase,
  testConfig,
  type LoggedIn,
} from '../../test/context.js';
import { EmailWorker, MAX_EMAIL_ATTEMPTS, backoffMs } from './email-worker.js';
import { isLoopback, loopbackOnly } from './dev-mailbox.routes.js';
import { DevMailboxSender, InMemorySender } from './senders.js';
import { renderEmail } from './templates.js';

const app = makeApp();
const API = '/api/v1';
/** Far enough ahead that every retry is due. */
const later = () => new Date(Date.now() + 365 * 86_400_000);

let org: string;
let owner: LoggedIn;

async function invite(email: string) {
  const res = await owner.agent
    .post(`${API}/organisations/${org}/invitations`)
    .set(CSRF_HEADER, owner.csrfToken)
    .send({ email, roles: ['VIEWER'] });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

beforeEach(async () => {
  await resetDatabase();
  org = (await createOrganisation('acme')).id;
  const user = await createUser('owner@example.com');
  await addMember(user.id, org, ['ORGANISATION_OWNER']);
  owner = await login(app, 'owner@example.com');
});

describe('email worker', () => {
  it('sends a queued email once, with an idempotency key, then erases the link', async () => {
    const invitationId = await invite('new@example.com');
    const token = await inviteTokenFor('new@example.com');
    const sender = new InMemorySender();
    const worker = new EmailWorker(appPrisma, sender, logger);

    expect(await worker.runOnce()).toBe(1);
    expect(await worker.runOnce()).toBe(0);
    expect(sender.sent).toHaveLength(1);
    const email = sender.sent[0]!;
    expect(email.to).toBe('new@example.com');
    expect(email.subject).toBe('owner invited you to Test acme on Flame');
    expect(email.text).toContain(`/invite/${token}`);
    expect(email.html).toContain(`/invite/${token}`);
    expect(email.text).toContain('Viewer');
    const row = await prisma.emailOutbox.findFirstOrThrow({ where: { invitationId } });
    expect(email.idempotencyKey).toBe(`email-outbox/${row.id}`);
    expect(row).toMatchObject({
      status: 'SENT',
      attempts: 1,
      transport: 'MEMORY',
      providerMessageId: 'memory-1',
      claimedAt: null,
    });
    expect(row.sentAt).not.toBeNull();
    expect(row.payload).not.toHaveProperty('link');
    expect(row.payload).toMatchObject({ linkErased: true, organisationName: 'Test acme' });
    expect(JSON.stringify(row)).not.toContain(token);

    const list = await owner.agent.get(`${API}/organisations/${org}/invitations`);
    expect(list.body.data[0].delivery).toBe('SENT');
  });

  it('retries with backoff and fails for good after 8 attempts, erasing the link and auditing', async () => {
    const invitationId = await invite('new@example.com');
    const sender = new InMemorySender();
    sender.failWith = 'Resend validation_error: domain not verified';
    const worker = new EmailWorker(appPrisma, sender, logger);

    expect(await worker.runOnce()).toBe(1);
    let row = await prisma.emailOutbox.findFirstOrThrow({ where: { invitationId } });
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1, lastError: sender.failWith });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + backoffMs(1) - 5_000);
    expect(row.payload).toHaveProperty('link');
    // Not due yet.
    expect(await worker.runOnce()).toBe(0);

    for (let attempt = 2; attempt <= MAX_EMAIL_ATTEMPTS; attempt++) {
      expect(await worker.runOnce(later())).toBe(1);
    }
    row = await prisma.emailOutbox.findFirstOrThrow({ where: { invitationId } });
    expect(row).toMatchObject({ status: 'FAILED', attempts: MAX_EMAIL_ATTEMPTS, claimedAt: null });
    expect(row.payload).not.toHaveProperty('link');
    expect(await worker.runOnce(later())).toBe(0);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'email.failed' } });
    expect(audit).toMatchObject({
      organisationId: org,
      actorUserId: null,
      entityType: 'EmailOutbox',
      entityId: row.id,
      metadata: { attempts: MAX_EMAIL_ATTEMPTS, invitationId },
    });
    const list = await owner.agent.get(`${API}/organisations/${org}/invitations`);
    expect(list.body.data[0].delivery).toBe('FAILED');
  });

  it('lets only one of several workers claim a row', async () => {
    await invite('new@example.com');
    const senders = [new InMemorySender(), new InMemorySender(), new InMemorySender()];
    const claimed = await Promise.all(
      senders.map((s) => new EmailWorker(appPrisma, s, logger).runOnce()),
    );
    expect(claimed.reduce((a, b) => a + b, 0)).toBe(1);
    expect(senders.flatMap((s) => s.sent)).toHaveLength(1);
  });

  it('recovers a row stuck in SENDING after the claim goes stale', async () => {
    const invitationId = await invite('new@example.com');
    const row = await prisma.emailOutbox.findFirstOrThrow({ where: { invitationId } });
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: { status: 'SENDING', claimedAt: new Date(Date.now() - 60 * 60_000), attempts: 1 },
    });
    const sender = new InMemorySender();
    const worker = new EmailWorker(appPrisma, sender, logger, { staleClaimMs: 5 * 60_000 });
    expect(await worker.runOnce()).toBe(1);
    expect(sender.sent).toHaveLength(1);
    expect(await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      status: 'SENT',
      attempts: 2,
    });
  });

  it('does not send the email of an invitation revoked while it was queued', async () => {
    const invitationId = await invite('new@example.com');
    await owner.agent
      .post(`${API}/organisations/${org}/invitations/${invitationId}/revoke`)
      .set(CSRF_HEADER, owner.csrfToken)
      .expect(200);
    const sender = new InMemorySender();
    expect(await new EmailWorker(appPrisma, sender, logger).runOnce()).toBe(0);
    expect(sender.sent).toHaveLength(0);
    const row = await prisma.emailOutbox.findFirstOrThrow({ where: { invitationId } });
    expect(row).toMatchObject({ status: 'CANCELLED', lastError: 'The invitation was revoked' });
    expect(row.payload).not.toHaveProperty('link');
    expect(
      (await owner.agent.get(`${API}/organisations/${org}/invitations`)).body.data[0].delivery,
    ).toBe('CANCELLED');
  });

  it('cancels instead of sending when the invitation stopped being pending after queueing', async () => {
    const invitationId = await invite('new@example.com');
    // Answered without going through the API's cancellation (e.g. a race with the worker).
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    const sender = new InMemorySender();
    expect(await new EmailWorker(appPrisma, sender, logger).runOnce()).toBe(1);
    expect(sender.sent).toHaveLength(0);
    const row = await prisma.emailOutbox.findFirstOrThrow({ where: { invitationId } });
    expect(row.status).toBe('CANCELLED');
    expect(row.payload).not.toHaveProperty('link');
  });

  it('never stores a link on a failed or cancelled email (database constraint)', async () => {
    const invitationId = await invite('new@example.com');
    const row = await prisma.emailOutbox.findFirstOrThrow({ where: { invitationId } });
    await expect(
      prisma.emailOutbox.update({ where: { id: row.id }, data: { status: 'CANCELLED' } }),
    ).rejects.toThrow();
    await expect(
      prisma.emailOutbox.update({ where: { id: row.id }, data: { status: 'FAILED' } }),
    ).rejects.toThrow();
  });

  it('keeps the link in development-mailbox mode', async () => {
    const invitationId = await invite('new@example.com');
    await new EmailWorker(appPrisma, new DevMailboxSender(), logger).runOnce();
    const row = await prisma.emailOutbox.findFirstOrThrow({ where: { invitationId } });
    expect(row).toMatchObject({ status: 'SENT', transport: 'DEV_MAILBOX' });
    expect(row.payload).toHaveProperty('link');
  });
});

describe('development mailbox', () => {
  it('is not mounted outside development', async () => {
    await invite('new@example.com');
    const res = await request(app).get(`${API}/dev/mailbox`);
    expect(res.status).toBe(404);
    const prod = makeApp({ config: { ...testConfig, isProduction: true } });
    expect((await request(prod).get(`${API}/dev/mailbox`)).status).toBe(404);
    // Development with Resend configured: emails leave the outbox, so no mailbox.
    const devWithResend = makeApp({
      config: {
        ...testConfig,
        isDevelopment: true,
        email: { mode: 'resend', apiKey: 're_test_not_used', from: 'Flame <a@b.example>' },
      },
    });
    expect((await request(devWithResend).get(`${API}/dev/mailbox`)).status).toBe(404);
  });

  it('answers only connections from this machine, whatever X-Forwarded-For says', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopback('10.0.0.5')).toBe(false);
    expect(isLoopback('::ffff:192.168.1.10')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);

    const run = (remoteAddress: string, forwardedFor?: string) => {
      const req = {
        socket: { remoteAddress },
        headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
      } as unknown as Parameters<typeof loopbackOnly>[0];
      let passed: unknown = 'not called';
      loopbackOnly(req, {} as Parameters<typeof loopbackOnly>[1], (err?: unknown) => {
        passed = err;
      });
      return passed;
    };
    expect(run('127.0.0.1')).toBeUndefined();
    expect(run('203.0.113.9', '127.0.0.1')).toMatchObject({ status: 404 });
  });

  it('shows recent emails with their links in development', async () => {
    await invite('new@example.com');
    const token = await inviteTokenFor('new@example.com');
    await new EmailWorker(appPrisma, new DevMailboxSender(), logger).runOnce();
    const dev = makeApp({ config: { ...testConfig, isDevelopment: true } });
    const res = await request(dev).get(`${API}/dev/mailbox`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject([
      {
        to: 'new@example.com',
        template: 'ORGANISATION_INVITATION',
        status: 'SENT',
        subject: 'owner invited you to Test acme on Flame',
      },
    ]);
    expect(res.body.data[0].text).toContain(`/invite/${token}`);
  });
});

describe('templates', () => {
  it('escapes every value in the HTML', () => {
    const { html, text } = renderEmail('ORGANISATION_INVITATION', {
      inviterName: '<script>alert(1)</script>',
      organisationName: 'A & B "Gas"',
      roles: ['ORGANISATION_OWNER'],
      expiresAt: '2026-11-21T10:00:00.000Z',
      link: 'https://app.example/invite/abc?x="1"',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;Gas&quot;');
    expect(html).toContain('lang="en"');
    expect(text).toContain('Your role: Owner.');
    expect(text).toContain('21 November 2026');
  });

  it('renders without the link once it has been erased', () => {
    const { text } = renderEmail('PLATFORM_ADMIN_INVITATION', {
      inviterName: 'Ada',
      expiresAt: '2026-11-21T10:00:00.000Z',
    });
    expect(text).toContain('removed from our records');
    expect(text).toContain('no access to any organisation');
  });
});
