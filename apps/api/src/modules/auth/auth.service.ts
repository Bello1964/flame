import type { PrismaClient } from '../../generated/prisma/client.js';
import type { MembershipSummary, SessionResponse } from '@carbon/shared';
import { unauthorized } from '../../lib/errors.js';
import { recordAudit } from '../audit/audit.service.js';
import { verifyAgainstDummy, verifyPassword } from './password.js';
import type { SessionService } from './session.service.js';
import type { LoginBody } from './auth.schemas.js';

const INVALID_CREDENTIALS = 'Invalid email or password';

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sessions: SessionService,
  ) {}

  /** Verifies credentials and opens a session. Failure messages never reveal which part was wrong. */
  async login(
    body: LoginBody,
    meta: RequestMeta,
  ): Promise<{ token: string; expiresAt: Date; session: SessionResponse }> {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });

    if (!user) {
      await verifyAgainstDummy(body.password);
      await recordAudit(this.prisma, {
        action: 'auth.login_failed',
        entityType: 'User',
        metadata: { reason: 'unknown_email' },
        ipAddress: meta.ipAddress,
      });
      throw unauthorized(INVALID_CREDENTIALS);
    }

    const passwordOk = await verifyPassword(user.passwordHash, body.password);
    if (!passwordOk || user.status !== 'ACTIVE') {
      // Whoever is attempting this is unauthenticated, so there is no actor. The
      // targeted account is recorded as the entity, not as the person acting.
      await recordAudit(this.prisma, {
        actorUserId: null,
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: passwordOk ? 'user_disabled' : 'bad_password' },
        ipAddress: meta.ipAddress,
      });
      throw unauthorized(INVALID_CREDENTIALS);
    }

    const created = await this.sessions.create(user.id, meta);
    await recordAudit(this.prisma, {
      actorUserId: user.id,
      action: 'auth.login_succeeded',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
    });

    return {
      token: created.token,
      expiresAt: created.expiresAt,
      session: await this.describeSession(user.id, created.csrfToken),
    };
  }

  /**
   * Audits that sign-in attempts were blocked by a rate limit. Like failed sign-ins, there
   * is no actor; the targeted account is the entity when the email matches a user.
   */
  async recordRateLimited(email: string, limit: string, meta: RequestMeta): Promise<void> {
    const user = email
      ? await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
      : null;
    await recordAudit(this.prisma, {
      actorUserId: null,
      action: 'auth.login_rate_limited',
      entityType: 'User',
      entityId: user?.id ?? null,
      metadata: { limit },
      ipAddress: meta.ipAddress,
    });
  }

  /** Current user plus active memberships in active organisations. */
  async describeSession(userId: string, csrfToken: string): Promise<SessionResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        isPlatformAdmin: true,
        memberships: {
          where: { status: 'ACTIVE', organisation: { status: 'ACTIVE' } },
          select: {
            roles: true,
            organisation: { select: { id: true, name: true, slug: true } },
          },
          orderBy: { organisation: { name: 'asc' } },
        },
      },
    });

    const memberships: MembershipSummary[] = user.memberships.map((m) => ({
      organisationId: m.organisation.id,
      organisationName: m.organisation.name,
      organisationSlug: m.organisation.slug,
      roles: m.roles,
    }));

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      memberships,
      csrfToken,
    };
  }

  async logout(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(sessionId);
    await recordAudit(this.prisma, {
      actorUserId: userId,
      action: 'auth.logout',
      entityType: 'Session',
      entityId: sessionId,
      ipAddress: meta.ipAddress,
    });
  }

  async logoutEverywhere(userId: string, meta: RequestMeta): Promise<number> {
    const count = await this.sessions.revokeAllForUser(userId);
    await recordAudit(this.prisma, {
      actorUserId: userId,
      action: 'auth.logout_all',
      entityType: 'User',
      entityId: userId,
      metadata: { revokedSessions: count },
      ipAddress: meta.ipAddress,
    });
    return count;
  }
}
