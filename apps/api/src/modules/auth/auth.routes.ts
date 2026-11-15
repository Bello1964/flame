import { createHash } from 'node:crypto';
import {
  Router,
  type CookieOptions,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { DataResponse, SessionResponse } from '@carbon/shared';
import type { AppConfig } from '../../config/env.js';
import { authOf, parse, requestMeta } from '../../lib/request.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { AppError } from '../../lib/errors.js';
import type { AuthService } from './auth.service.js';
import type { SessionService } from './session.service.js';
import { loginBodySchema } from './auth.schemas.js';

/** Normalised (trimmed, lower-cased) email from a sign-in body, matching how login looks users up. */
function normalisedEmail(body: unknown): string {
  return typeof body === 'object' &&
    body !== null &&
    'email' in body &&
    typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : '';
}

/** Hash of the normalised email, so raw addresses are not held in the limiters' memory. */
function accountKey(body: unknown): string {
  return createHash('sha256').update(normalisedEmail(body)).digest('hex');
}

/** Which sign-in limit blocked a request; recorded in the audit log. */
export type LoginLimit = 'ip' | 'account_ip' | 'account';

export function authRouter(auth: AuthService, sessions: SessionService, config: AppConfig): Router {
  const router = Router();

  const cookieOptions = (expires?: Date): CookieOptions => ({
    httpOnly: true,
    secure: config.session.secureCookie,
    sameSite: 'lax',
    path: '/',
    ...(expires ? { expires } : {}),
  });

  /**
   * Rejects a blocked attempt with 429. The first blocked request of each window is
   * audited; later ones are not, so a flood of blocked requests cannot flood the log.
   */
  const blocked =
    (limit: LoginLimit) =>
    (req: Request, _res: Response, next: NextFunction): void => {
      const reject = () => {
        next(new AppError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.'));
      };
      const info = (req as Request & { rateLimit?: { used: number; limit: number } }).rateLimit;
      if (!info || info.used !== info.limit + 1) {
        reject();
        return;
      }
      // The limiter does not await its handler, so handle the audit promise here: a failed
      // audit write is logged and the attempt is still rejected with 429.
      auth
        .recordRateLimited(normalisedEmail(req.body), limit, requestMeta(req))
        .catch((err: unknown) => {
          req.log.error({ err }, 'Could not audit a rate-limited sign-in');
        })
        .finally(reject);
    };

  const limiterDefaults = {
    windowMs: config.loginRateLimit.windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Only failed attempts count towards the limits.
    skipSuccessfulRequests: true,
  } as const;

  /** Per client IP: slows one client trying many accounts. */
  const ipLimiter = rateLimit({
    ...limiterDefaults,
    limit: config.loginRateLimit.maxPerIp,
    handler: blocked('ip'),
  });

  /**
   * Per account from one IP (strict): stops one client guessing a password. An attacker
   * exhausting it locks only their own address out of that account, not the real user.
   */
  const accountIpLimiter = rateLimit({
    ...limiterDefaults,
    limit: config.loginRateLimit.maxPerAccountIp,
    keyGenerator: (req) => `account-ip:${accountKey(req.body)}:${ipKeyGenerator(req.ip ?? '')}`,
    handler: blocked('account_ip'),
  });

  /**
   * Per account from all IPs (higher ceiling): caps guessing spread across many
   * addresses. Reaching it blocks the account everywhere for the rest of the window,
   * so it is set well above the per-address limit.
   */
  const accountLimiter = rateLimit({
    ...limiterDefaults,
    limit: config.loginRateLimit.maxPerAccount,
    keyGenerator: (req) => `account:${accountKey(req.body)}`,
    handler: blocked('account'),
  });

  router.post('/login', ipLimiter, accountIpLimiter, accountLimiter, async (req, res) => {
    const body = parse(loginBodySchema, req.body);
    const meta = requestMeta(req);

    // Credentials first: a failed attempt (which throws) must not end the current session.
    const result = await auth.login(body, meta);

    // Never reuse a pre-existing session across a successful sign-in (session fixation).
    // The new token issued below replaces the cookie either way.
    if (req.auth) await sessions.revoke(req.auth.sessionId);

    res.cookie(config.session.cookieName, result.token, cookieOptions(result.expiresAt));
    const response: DataResponse<SessionResponse> = { data: result.session };
    res.status(200).json(response);
  });

  router.get('/session', requireAuth, async (req, res) => {
    const { userId, csrfToken } = authOf(req);
    const response: DataResponse<SessionResponse> = {
      data: await auth.describeSession(userId, csrfToken),
    };
    res.json(response);
  });

  router.post('/logout', requireAuth, async (req, res) => {
    const { userId, sessionId } = authOf(req);
    await auth.logout(userId, sessionId, requestMeta(req));
    res.clearCookie(config.session.cookieName, cookieOptions());
    res.status(204).end();
  });

  router.post('/logout-all', requireAuth, async (req, res) => {
    const { userId } = authOf(req);
    await auth.logoutEverywhere(userId, requestMeta(req));
    res.clearCookie(config.session.cookieName, cookieOptions());
    res.status(204).end();
  });

  return router;
}
