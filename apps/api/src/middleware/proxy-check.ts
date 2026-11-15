import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

/**
 * Behind a reverse proxy (e.g. Render) with TRUST_PROXY=0, every request appears to
 * come from the proxy's IP, so the per-IP sign-in limit would be shared by all users
 * and could lock everyone out. Warns once when that looks like the case.
 */
export function proxyMisconfigurationWarning(logger: Logger, trustProxy: number): RequestHandler {
  let warned = false;
  return (req, _res, next) => {
    if (!warned && trustProxy === 0 && req.get('x-forwarded-for') !== undefined) {
      warned = true;
      logger.warn(
        'Received X-Forwarded-For but TRUST_PROXY is 0: client IPs resolve to the proxy, ' +
          'so per-IP rate limits are shared by all users. Set TRUST_PROXY to the number ' +
          'of proxy hops (1 on Render).',
      );
    }
    next();
  };
}
