import path from 'node:path';
import express, { Router, type RequestHandler } from 'express';

/**
 * Serves the built web app (apps/web/dist) from the API's own origin in production, so
 * the session cookie and CSRF Origin check need no cross-site setup (§12.1). Hosts such
 * as herokuapp.com are public suffixes: two apps there would be different sites.
 *
 * - Hashed build files under /assets/ are cached for a year; a missing one is a 404,
 *   never the HTML page.
 * - Every other GET/HEAD outside /api/ gets index.html (client-side routes), never cached
 *   so a deploy is picked up on the next visit.
 */
export function webAppRouter(distDir: string): Router {
  const router = Router();
  const indexFile = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets') + path.sep;

  router.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        res.setHeader(
          'Cache-Control',
          filePath.startsWith(assetsDir)
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=300',
        );
      },
    }),
  );

  const spaFallback: RequestHandler = (req, res, next) => {
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    const isApi = req.path === '/api' || req.path.startsWith('/api/');
    if (!isRead || isApi || req.path.startsWith('/assets/')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile, (err) => {
      if (err) next(err);
    });
  };
  router.use(spaFallback);
  return router;
}
