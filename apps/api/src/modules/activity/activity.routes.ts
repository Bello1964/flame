import { Router, type Request } from 'express';
import type {
  ActivityRecordDto,
  ActivityRecordEventDto,
  DataResponse,
  ListResponse,
  OrganisationSettingsDto,
} from '@flame/shared';
import { authOf, parse } from '../../lib/request.js';
import { organisationOf, requirePermission } from '../../middleware/organisation-context.js';
import { idParamSchema } from '../facilities/facilities.schemas.js';
import type { SettingsService } from '../organisations/settings.service.js';
import type { ActivityService, Caller } from './activity.service.js';
import {
  activityCreateSchema,
  activityListQuerySchema,
  activityUpdateSchema,
  settingsUpdateSchema,
  withdrawSchema,
} from './activity.schemas.js';

/** The authorised member (from their membership, never from the client) making the request. */
export function callerOf(req: Request): Caller {
  const organisation = organisationOf(req);
  return {
    organisationId: organisation.id,
    userId: authOf(req).userId,
    roles: organisation.roles,
    ipAddress: req.ip ?? null,
  };
}

export function one<T>(data: T): DataResponse<T> {
  return { data };
}

/**
 * Mounted under /organisations/:organisationId after requireAuth and requireOrganisation.
 * Activity records are withdrawn via POST /:id/withdraw; there are no DELETE endpoints.
 */
export function activityRouter(activity: ActivityService, settings: SettingsService): Router {
  const router = Router({ mergeParams: true });
  const read = requirePermission('activity:read');
  const write = requirePermission('activity:write');

  router.get('/activity-records', read, async (req, res) => {
    const query = parse(activityListQuerySchema, req.query);
    const caller = callerOf(req);
    const { items, total } = await activity.list(caller.organisationId, caller, query);
    const body: ListResponse<ActivityRecordDto> = {
      data: items,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
    res.json(body);
  });

  router.post('/activity-records', write, async (req, res) => {
    const body = parse(activityCreateSchema, req.body);
    res.status(201).json(one(await activity.create(callerOf(req), body)));
  });

  router.get('/activity-records/:id', read, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const caller = callerOf(req);
    res.json(one(await activity.get(caller.organisationId, caller, id)));
  });

  router.get('/activity-records/:id/history', read, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body: DataResponse<ActivityRecordEventDto[]> = one(
      await activity.history(organisationOf(req).id, id),
    );
    res.json(body);
  });

  router.patch('/activity-records/:id', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body = parse(activityUpdateSchema, req.body);
    res.json(one(await activity.update(callerOf(req), id, body)));
  });

  router.post('/activity-records/:id/withdraw', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const { reason } = parse(withdrawSchema, req.body);
    res.json(one(await activity.withdraw(callerOf(req), id, reason)));
  });

  // ─── Organisation settings ─────────────────────────────────────────────────

  router.get('/settings', requirePermission('organisation:read'), async (req, res) => {
    const body: DataResponse<OrganisationSettingsDto> = one(
      await settings.get(organisationOf(req).id),
    );
    res.json(body);
  });

  router.patch('/settings', requirePermission('organisation:settings'), async (req, res) => {
    const body = parse(settingsUpdateSchema, req.body);
    res.json(one(await settings.update(callerOf(req), body)));
  });

  return router;
}
