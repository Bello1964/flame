import { createHash } from 'node:crypto';
import {
  Router,
  type CookieOptions,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { rateLimit } from 'express-rate-limit';
import type { DataResponse, SessionResponse } from '@carbon/shared';
import type { AppConfig } from '../../config/env.js';
import { authOf, parse, requestMeta } from '../../lib/request.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { AppError } from '../../lib/errors.js';
import type { AuthService } from './auth.service.js';
import type { SessionService } from './session.service.js';
import { loginBodySchema } from './auth.schemas.js';

/** Hash of the normalised (trimmed, lower-cased) email, matching how login looks users up. */
function accountKey(body: unknown): string {
  const email =
    typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : '';
  return createHash('sha256').update(email).digest('hex');
}

export function authRouter(auth: AuthService, sessions: SessionService, config: AppConfig): Router {
  const router = Router();

  const cookieOptions = (expires?: Date): CookieOptions => ({
    httpOnly: true,
    secure: config.session.secureCookie,
    sameSite: 'lax',
    path: '/',
    ...(expires ? { expires } : {}),
  });

  const limiterDefaults = {
    windowMs: config.loginRateLimit.windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Only failed attempts count towards the limits.
    skipSuccessfulRequests: true,
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.'));
    },
  } as const;

  /** Failed attempts per client IP: slows one client trying many accounts. */
  const ipLimiter = rateLimit({ ...limiterDefaults, limit: config.loginRateLimit.maxPerIp });

  /**
   * Failed attempts per account, from any IP: slows password guessing against one
   * account spread across many addresses. Keyed by a hash of the normalised email,
   * so raw addresses are not held in the limiter's memory.
   */
  const accountLimiter = rateLimit({
    ...limiterDefaults,
    limit: config.loginRateLimit.maxPerAccount,
    keyGenerator: (req) => `account:${accountKey(req.body)}`,
  });

  router.post('/login', ipLimiter, accountLimiter, async (req, res) => {
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
