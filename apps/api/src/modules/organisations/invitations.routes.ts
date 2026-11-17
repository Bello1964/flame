import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { DataResponse, InvitationLookupDto, SessionResponse } from '@flame/shared';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { parse, requestMeta } from '../../lib/request.js';
import { one } from '../activity/activity.routes.js';
import { sessionCookieOptions, type SignInLimiters } from '../auth/auth.routes.js';
import type { AuthService } from '../auth/auth.service.js';
import type { SessionService } from '../auth/session.service.js';
import type { InvitationsService } from './invitations.service.js';
import { invitationAcceptSchema, invitationTokenSchema } from './members.schemas.js';

/**
 * Public invitation endpoints, /invitations/{lookup,accept,decline}
 * (ARCHITECTURAL_WORKFLOW.md §7.2). No sign-in is needed. The token travels in the
 * request body, never the URL, so it stays out of access logs. CSRF: like sign-in, a
 * foreign Origin is rejected; a request that carries a session must also send its
 * X-CSRF-Token (the global CSRF middleware). Failed requests are rate-limited per client
 * IP with the sign-in limits. When accept checks an existing account's password, the
 * per-account sign-in limiters (the same instances as /auth/login, keyed on the invited
 * email) apply too, so guesses through either route count against both.
 */
export function publicInvitationsRouter(
  invitations: InvitationsService,
  auth: AuthService,
  sessions: SessionService,
  config: AppConfig,
  limiters: SignInLimiters,
): Router {
  const router = Router();

  router.use(
    rateLimit({
      windowMs: config.loginRateLimit.windowMs,
      limit: config.loginRateLimit.maxPerIp,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      handler: (_req, _res, next) => {
        next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.'));
      },
    }),
  );

  /** Records which account an accept request will check a password for, if any. */
  const resolveSignInEmail: RequestHandler = async (req, res, next) => {
    const body = invitationAcceptSchema.safeParse(req.body);
    if (body.success && body.data.password !== undefined) {
      const email = await invitations.passwordAttemptEmail(
        body.data.token,
        req.auth?.userId ?? null,
      );
      if (email) res.locals['signInEmail'] = email;
    }
    next();
  };

  /** Applies a sign-in limiter only to requests that will check an account's password. */
  const whenPasswordChecked =
    (limiter: RequestHandler): RequestHandler =>
    (req, res, next) => {
      if (typeof res.locals['signInEmail'] === 'string') return limiter(req, res, next);
      next();
    };

  router.post('/lookup', async (req, res) => {
    const { token } = parse(invitationTokenSchema, req.body);
    const body: DataResponse<InvitationLookupDto> = one(await invitations.lookup(token));
    res.json(body);
  });

  router.post(
    '/accept',
    resolveSignInEmail,
    whenPasswordChecked(limiters.accountIp),
    whenPasswordChecked(limiters.account),
    async (req, res) => {
      const input = parse(invitationAcceptSchema, req.body);
      const meta = requestMeta(req);
      const result = await invitations.accept(
        input,
        req.auth ? { userId: req.auth.userId, sessionId: req.auth.sessionId } : null,
        meta.ipAddress,
      );
      if (!result.openSession && req.auth) {
        // Accepted for the signed-in account: the current session carries on (the service
        // checked inside the transaction that it is still live).
        const body: DataResponse<SessionResponse> = one(
          await auth.describeSession(req.auth.userId, req.auth.csrfToken),
        );
        res.json(body);
        return;
      }
      // Never carry a previous session across into the accepted account (session fixation).
      if (req.auth) await sessions.revoke(req.auth.sessionId);
      const opened = await auth.openSession(result.userId, meta, 'invitation');
      res.cookie(
        config.session.cookieName,
        opened.token,
        sessionCookieOptions(config, opened.expiresAt),
      );
      const body: DataResponse<SessionResponse> = one(opened.session);
      res.json(body);
    },
  );

  router.post('/decline', async (req, res) => {
    const { token } = parse(invitationTokenSchema, req.body);
    const body: DataResponse<InvitationLookupDto> = one(
      await invitations.decline(token, req.auth?.userId ?? null, req.ip ?? null),
    );
    res.json(body);
  });

  return router;
}
