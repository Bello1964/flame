import { Router } from 'express';
import type { HealthResponse } from '@carbon/shared';

/** Returns true when the database is reachable. Injected so tests need no database. */
export type DatabaseCheck = () => Promise<boolean>;

export function healthRouter(checkDatabase: DatabaseCheck): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const databaseOk = await checkDatabase();
    const body: HealthResponse = { status: 'ok', database: databaseOk ? 'ok' : 'unavailable' };
    res.status(databaseOk ? 200 : 503).json(body);
  });

  return router;
}
