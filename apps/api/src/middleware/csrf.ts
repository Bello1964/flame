import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { CSRF_HEADER } from '@carbon/shared';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrfError = (): AppError =>
  new AppError(403, 'CSRF_REJECTED', 'Request rejected by CSRF protection');

function tokensMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Two layers for state-changing requests:
 * 1. If the browser sends an Origin header, it must be the web app's origin
 *    (also protects the unauthenticated login endpoint against login CSRF).
 * 2. Authenticated requests must echo the session's CSRF token in X-CSRF-Token.
 */
export function csrfProtection(
  webOrigin: string,
  /** Paths exempt from the token check (still Origin-checked), e.g. login, which issues the token. */
  tokenExemptPaths: readonly string[] = [],
): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get('origin');
    if (origin !== undefined && origin !== webOrigin) {
      next(csrfError());
      return;
    }

    if (req.auth && !tokenExemptPaths.includes(req.path)) {
      const received = req.get(CSRF_HEADER);
      if (!received || !tokensMatch(req.auth.csrfToken, received)) {
        next(csrfError());
        return;
      }
    }

    next();
  };
}
