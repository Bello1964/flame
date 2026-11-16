import { Router, type Request, type RequestHandler } from 'express';
import type {
  DataResponse,
  MethodologyEditionDto,
  MethodologyEditionSummaryDto,
} from '@flame/shared';
import { forbidden } from '../../lib/errors.js';
import { authOf, parse } from '../../lib/request.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { idParamSchema } from '../facilities/facilities.schemas.js';
import type { MethodologyService, PlatformAdmin } from './methodology.service.js';
import {
  editionUpdateSchema,
  parameterKeySchema,
  parameterUpdateSchema,
  reasonSchema,
} from './methodology.schemas.js';

function one<T>(data: T): DataResponse<T> {
  return { data };
}

/**
 * GET /methodology/editions[/:id]: approved and superseded editions, readable by anyone
 * (no sign-in), so users, auditors and regulators can check how results are calculated.
 */
export function methodologyPublicRouter(methodology: MethodologyService): Router {
  const router = Router();
  router.get('/editions', async (_req, res) => {
    const body: DataResponse<MethodologyEditionSummaryDto[]> = one(
      await methodology.listPublished(),
    );
    res.json(body);
  });
  router.get('/editions/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body: DataResponse<MethodologyEditionDto> = one(await methodology.getPublished(id));
    res.json(body);
  });
  return router;
}

/** Platform-level operations only; grants no access to any organisation's data. */
const requirePlatformAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth?.isPlatformAdmin) {
    next(forbidden('Only Platform Administrators can manage the methodology registry'));
    return;
  }
  next();
};

function adminOf(req: Request): PlatformAdmin {
  return { userId: authOf(req).userId, ipAddress: req.ip ?? null };
}

/** /admin/methodology: drafts, edits, approval and withdrawal of editions. */
export function methodologyAdminRouter(methodology: MethodologyService): Router {
  const router = Router();
  router.use(requireAuth, requirePlatformAdmin);

  router.get('/editions', async (_req, res) => {
    res.json(one(await methodology.listAll()));
  });
  router.get('/editions/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(one(await methodology.getForAdmin(adminOf(req), id)));
  });
  router.post('/editions/:id/draft', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.status(201).json(one(await methodology.draftFrom(adminOf(req), id)));
  });
  router.patch('/editions/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body = parse(editionUpdateSchema, req.body);
    res.json(one(await methodology.update(adminOf(req), id, body)));
  });
  router.patch('/editions/:id/parameters/:key', async (req, res) => {
    const { id, key } = parse(parameterKeySchema, req.params);
    const body = parse(parameterUpdateSchema, req.body);
    res.json(one(await methodology.updateParameter(adminOf(req), id, key, body)));
  });
  router.post('/editions/:id/approve', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(one(await methodology.approve(adminOf(req), id)));
  });
  router.post('/editions/:id/withdraw', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const { reason } = parse(reasonSchema, req.body);
    res.json(one(await methodology.withdraw(adminOf(req), id, reason)));
  });
  return router;
}
