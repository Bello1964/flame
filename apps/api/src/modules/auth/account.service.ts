import { randomBytes } from 'node:crypto';
import {
  ACCOUNT_ERROR_CODES,
  PASSWORD_RESET_VALIDITY_MINUTES,
  type CurrentUser,
} from '@flame/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError, conflict, fieldErrors, unauthorized } from '../../lib/errors.js';
import { recordAudit } from '../audit/audit.service.js';
import { cancelQueuedEmails, enqueueEmail } from '../email/outbox.js';
import { lockUser } from './accounts.js';
import type { RequestMeta } from './auth.service.js';
import type {
  PasswordChangeBody,
  PasswordResetCompleteBody,
  PasswordResetRequestBody,
} from './auth.schemas.js';
import { hashPassword, verifyPassword } from './password.js';
import { hashToken, revokeAllSessions } from './session.service.js';

const VALIDITY_MS = PASSWORD_RESET_VALIDITY_MINUTES * 60_000;
const SAME_PASSWORD = 'Choose a password different from your current one';

const invalidLink = (): AppError =>
  new AppError(
    400,
    ACCOUNT_ERROR_CODES.PASSWORD_RESET_INVALID,
    'This password reset link is not valid or has expired. Ask for a new one.',
  );

/**
 * Password reset, password change and profile (ARCHITECTURAL_WORKFLOW.md §7.3).
 *
 * Reset links: the token is random (32 bytes); only its SHA-256 hash is stored and the raw
 * token exists only in the queued email until it is sent. A link is valid for 15 minutes,
 * can be used once, and a newer request cancels it. Only ACTIVE accounts get one; for any
 * other email the request is answered the same way but nothing is sent or stored.
 */
export class AccountService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly webOrigin: string,
  ) {}

  // ─── Password reset (public) ───────────────────────────────────────────────

  /** Queues a reset link for an ACTIVE account. Silent (no error, no hint) otherwise. */
  async requestReset(body: PasswordResetRequestBody, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return;

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + VALIDITY_MS);

    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { status: true, name: true, email: true },
      });
      if (current.status !== 'ACTIVE') return;

      // At most one usable link per account: the newest request wins.
      const previous = await tx.passwordReset.findMany({
        where: { userId: user.id, status: 'PENDING' },
        select: { id: true },
      });
      for (const old of previous) {
        await tx.passwordReset.update({ where: { id: old.id }, data: { status: 'CANCELLED' } });
        await cancelQueuedEmails(
          tx,
          { passwordResetId: old.id },
          'A newer password reset link was requested',
        );
      }

      const reset = await tx.passwordReset.create({
        data: { userId: user.id, tokenHash: hashToken(token), createdAt: now, expiresAt },
        select: { id: true },
      });
      await enqueueEmail(
        tx,
        current.email,
        {
          template: 'PASSWORD_RESET',
          payload: {
            name: current.name,
            expiresAt: expiresAt.toISOString(),
            link: `${this.webOrigin}/reset-password/${token}`,
          },
        },
        { passwordResetId: reset.id },
      );
      await recordAudit(tx, {
        actorUserId: null,
        action: 'auth.password_reset_requested',
        entityType: 'User',
        entityId: user.id,
        metadata: {
          passwordResetId: reset.id,
          expiresAt: expiresAt.toISOString(),
          cancelledLinks: previous.length,
        },
        ipAddress: meta.ipAddress,
      });
    });
  }

  /**
   * Sets a new password with a reset link and signs the account out everywhere. Returns
   * the account's id. The link is consumed by a conditional update, so it works once.
   */
  async completeReset(body: PasswordResetCompleteBody, meta: RequestMeta): Promise<string> {
    const now = new Date();
    const found = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(body.token) },
      select: {
        id: true,
        userId: true,
        status: true,
        expiresAt: true,
        user: { select: { status: true, passwordHash: true } },
      },
    });
    if (!found || found.status !== 'PENDING' || found.expiresAt <= now) throw invalidLink();

    if (
      found.user.status === 'ACTIVE' &&
      (await verifyPassword(found.user.passwordHash, body.password))
    ) {
      throw fieldErrors({ password: [SAME_PASSWORD] });
    }
    // Hashing is slow; do it before taking any locks.
    const passwordHash = await hashPassword(body.password);

    const outcome = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, found.userId);
      const user = await tx.user.findUniqueOrThrow({
        where: { id: found.userId },
        select: { status: true, name: true, email: true },
      });
      if (user.status !== 'ACTIVE') {
        // Disabled after the link was sent: the link can never be used.
        await tx.passwordReset.updateMany({
          where: { id: found.id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        await cancelQueuedEmails(tx, { passwordResetId: found.id }, 'The account is disabled');
        return 'invalid' as const;
      }
      const used = await tx.passwordReset.updateMany({
        where: { id: found.id, status: 'PENDING', expiresAt: { gt: now } },
        data: { status: 'USED', usedAt: now },
      });
      if (used.count !== 1) return 'invalid' as const;

      await tx.user.update({ where: { id: found.userId }, data: { passwordHash } });
      const revokedSessions = await revokeAllSessions(tx, found.userId);
      await enqueueEmail(
        tx,
        user.email,
        {
          template: 'PASSWORD_CHANGED',
          payload: { name: user.name, changedAt: now.toISOString(), via: 'reset' },
        },
        null,
      );
      await recordAudit(tx, {
        actorUserId: null,
        action: 'auth.password_reset_completed',
        entityType: 'User',
        entityId: found.userId,
        metadata: { passwordResetId: found.id, revokedSessions },
        ipAddress: meta.ipAddress,
      });
      return 'done' as const;
    });
    if (outcome === 'invalid') throw invalidLink();
    return found.userId;
  }

  // ─── Signed-in account ─────────────────────────────────────────────────────

  /** The account's email, for the per-account sign-in limiters on a password change. */
  async emailOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email ?? null;
  }

  /**
   * Changes the password after checking the current one, and signs out every other
   * session; the one making the change stays signed in.
   */
  async changePassword(
    userId: string,
    sessionId: string,
    body: PasswordChangeBody,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      await recordAudit(this.prisma, {
        actorUserId: userId,
        action: 'auth.password_change_failed',
        entityType: 'User',
        entityId: userId,
        metadata: { reason: 'bad_password' },
        ipAddress: meta.ipAddress,
      });
      throw fieldErrors({ currentPassword: ['The current password is incorrect'] });
    }
    if (body.newPassword === body.currentPassword) {
      throw fieldErrors({ newPassword: [SAME_PASSWORD] });
    }
    const passwordHash = await hashPassword(body.newPassword);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const current = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { passwordHash: true, name: true, email: true, status: true },
      });
      // Disabled meanwhile (e.g. last membership removed): its sessions are already revoked.
      if (current.status !== 'ACTIVE') throw unauthorized();
      // Changed by another request (or a reset) since the current password was checked.
      if (current.passwordHash !== user.passwordHash) {
        throw conflict('Your password was changed meanwhile. Sign in again and retry.');
      }
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      const revoked = await tx.session.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: now },
      });
      await enqueueEmail(
        tx,
        current.email,
        {
          template: 'PASSWORD_CHANGED',
          payload: { name: current.name, changedAt: now.toISOString(), via: 'account' },
        },
        null,
      );
      await recordAudit(tx, {
        actorUserId: userId,
        action: 'auth.password_changed',
        entityType: 'User',
        entityId: userId,
        metadata: { revokedOtherSessions: revoked.count },
        ipAddress: meta.ipAddress,
      });
    });
  }

  /** Changes the display name. A name equal to the current one changes nothing. */
  async updateName(userId: string, name: string, meta: RequestMeta): Promise<CurrentUser> {
    return this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const current = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true, name: true, isPlatformAdmin: true },
      });
      if (current.name === name) return current;
      const updated = await tx.user.update({
        where: { id: userId },
        data: { name },
        select: { id: true, email: true, name: true, isPlatformAdmin: true },
      });
      await recordAudit(tx, {
        actorUserId: userId,
        action: 'user.name_changed',
        entityType: 'User',
        entityId: userId,
        metadata: { from: current.name, to: name },
        ipAddress: meta.ipAddress,
      });
      return updated;
    });
  }
}
