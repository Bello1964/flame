import type { RequestHandler } from 'express';
import type { SessionService } from '../modules/auth/session.service.js';
import { unauthorized } from '../lib/errors.js';

/** Resolves the session cookie (if any) into req.auth. Never rejects on its own. */
export function authenticate(sessions: SessionService, cookieName: string): RequestHandler {
  return async (req, _res, next) => {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[cookieName];
    if (typeof token === 'string' && token.length > 0 && token.length <= 128) {
      const session = await sessions.resolve(token);
      if (session) {
        req.auth = {
          userId: session.userId,
          sessionId: session.sessionId,
          csrfToken: session.csrfToken,
          isPlatformAdmin: session.isPlatformAdmin,
        };
      }
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(unauthorized());
    return;
  }
  next();
};
