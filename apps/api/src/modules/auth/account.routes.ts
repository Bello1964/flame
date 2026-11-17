import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { CurrentUser, DataResponse } from '@flame/shared';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { authOf, parse, requestMeta } from '../../lib/request.js';
import { requireAuth } from '../../middleware/authenticate.js';
import type { AccountService } from './account.service.js';
import { accountKey, sessionCookieOptions, type SignInLimiters } from './auth.routes.js';
import {
  accountUpdateSchema,
  passwordChangeSchema,
  passwordResetCompleteSchema,
  passwordResetRequestSchema,
} from './auth.schemas.js';

const tooMany: RequestHandler = (_req, _res, next) => {
  next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.'));
};

/**
 * Public password reset, /auth/password-reset/{request,complete}
 * (ARCHITECTURAL_WORKFLOW.md §7.3). The token travels in the request body, never the URL.
 * CSRF as for sign-in: a foreign Origin is rejected, and a request carrying a session must
 * send its X-CSRF-Token.
 */
export function passwordResetRouter(account: AccountService, config: AppConfig): Router {
  const router = Router();
  const defaults = {
    windowMs: config.loginRateLimit.windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooMany,
  } as const;

  /**
   * Every request counts (the answer never says whether an email was sent): per client IP,
   * and per email address so one inbox cannot be flooded with reset emails.
   */
  const requestLimits = [
    rateLimit({ ...defaults, limit: config.loginRateLimit.maxPerIp }),
    rateLimit({
      ...defaults,
      limit: config.loginRateLimit.maxPerAccountIp,
      keyGenerator: (req, res) => `reset-email:${accountKey(req, res)}`,
    }),
  ];

  router.post('/request', ...requestLimits, async (req, res) => {
    const body = parse(passwordResetRequestSchema, req.body);
    // Answer before any account lookup, so the response time is the same whether or not
    // the email belongs to an account (no account enumeration).
    res.status(202).json({ data: { accepted: true } });
    try {
      await account.requestReset(body, requestMeta(req));
    } catch (err) {
      req.log.error({ err }, 'Could not issue a password reset link');
    }
  });

  router.post(
    '/complete',
    // Failed attempts only, like sign-in: guessing tokens is slowed per client IP.
    rateLimit({ ...defaults, limit: config.loginRateLimit.maxPerIp, skipSuccessfulRequests: true }),
    async (req, res) => {
      const body = parse(passwordResetCompleteSchema, req.body);
      const userId = await account.completeReset(body, requestMeta(req));
      // Every session of that account was revoked, including this one if it was theirs.
      if (req.auth?.userId === userId) {
        res.clearCookie(config.session.cookieName, sessionCookieOptions(config));
      }
      res.status(204).end();
    },
  );

  return router;
}

/** The signed-in user's own account, /account (ARCHITECTURAL_WORKFLOW.md §7.3). */
export function accountRouter(account: AccountService, limiters: SignInLimiters): Router {
  const router = Router();
  router.use(requireAuth);

  router.patch('/', async (req, res) => {
    const { userId } = authOf(req);
    const { name } = parse(accountUpdateSchema, req.body);
    const body: DataResponse<CurrentUser> = {
      data: await account.updateName(userId, name, requestMeta(req)),
    };
    res.json(body);
  });

  /** The current password is checked like a sign-in, so it shares the per-account limits. */
  const resolveSignInEmail: RequestHandler = async (req, res, next) => {
    const email = await account.emailOf(authOf(req).userId);
    if (email) res.locals['signInEmail'] = email;
    next();
  };

  router.post(
    '/password',
    resolveSignInEmail,
    limiters.accountIp,
    limiters.account,
    async (req, res) => {
      const { userId, sessionId } = authOf(req);
      const body = parse(passwordChangeSchema, req.body);
      await account.changePassword(userId, sessionId, body, requestMeta(req));
      res.status(204).end();
    },
  );

  return router;
}
