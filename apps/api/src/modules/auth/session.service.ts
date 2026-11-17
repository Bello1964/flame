import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { AppConfig } from '../../config/env.js';
import type { Db } from '../audit/audit.service.js';

/** Refresh lastSeenAt at most this often, to avoid a database write on every request. */
const LAST_SEEN_REFRESH_MS = 60_000;

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  csrfToken: string;
  isPlatformAdmin: boolean;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Revokes every active session of a user. Pass a transaction client to revoke them
 * together with the change that requires it (e.g. disabling the account).
 */
export async function revokeAllSessions(db: Db, userId: string): Promise<number> {
  const result = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export class SessionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig['session'],
  ) {}

  /** Creates a session and returns the raw cookie token (never stored). */
  async create(
    userId: string,
    meta: { ipAddress: string | null; userAgent: string | null },
  ): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.absoluteTimeoutMs);

    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        csrfToken,
        userId,
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
      },
    });

    return { token, csrfToken, expiresAt };
  }

  /** Returns the session for a cookie token, or null if unknown, revoked, expired or idle. */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { status: true, isPlatformAdmin: true } } },
    });
    if (!session || session.revokedAt) return null;

    const now = Date.now();
    const idleExpired = now - session.lastSeenAt.getTime() > this.config.idleTimeoutMs;
    if (session.expiresAt.getTime() <= now || idleExpired || session.user.status !== 'ACTIVE') {
      return null;
    }

    if (now - session.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      csrfToken: session.csrfToken,
      isPlatformAdmin: session.user.isPlatformAdmin,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active session for a user (e.g. "sign out everywhere"). Returns the count. */
  revokeAllForUser(userId: string): Promise<number> {
    return revokeAllSessions(this.prisma, userId);
  }
}
