import { Router } from 'express';
import {
  CALCULATION_ACTIONS,
  CALCULATION_COMMENT_REQUIRED,
  type CalculationAction,
  type CalculationDto,
  type CalculationEventDto,
  type DataResponse,
  type FlareEfficiencyDto,
  type GasCompositionDto,
  type ListResponse,
  type Permission,
} from '@flame/shared';
import { parse } from '../../lib/request.js';
import { organisationOf, requirePermission } from '../../middleware/organisation-context.js';
import { callerOf, one } from '../activity/activity.routes.js';
import { idParamSchema } from '../facilities/facilities.schemas.js';
import type { CalculationsService } from './calculations.service.js';
import {
  calculationListQuerySchema,
  compositionCreateSchema,
  efficiencyCreateSchema,
  optionalComment,
  requiredComment,
  runSchema,
  withdrawInputSchema,
} from './calculations.schemas.js';
import type { InputsService } from './inputs.service.js';

/**
 * The coarse gate per action; the service decides per calculation (state, claim,
 * separation of duties). release-claim and reject are open to more than one permission.
 */
/** The permission each calculation workflow action needs (also read by the API docs). */
export const CALCULATION_ACTION_GATES: Record<CalculationAction, Permission> = {
  submit: 'calculation:run',
  recall: 'calculation:run',
  discard: 'calculation:run',
  'start-review': 'calculation:review',
  'release-claim': 'calculation:read',
  forward: 'calculation:review',
  approve: 'calculation:approve',
  reject: 'calculation:read',
};

/** Mounted under /organisations/:organisationId after requireAuth and requireOrganisation. */
export function calculationsRouter(
  calculations: CalculationsService,
  inputs: InputsService,
): Router {
  const router = Router({ mergeParams: true });
  const read = requirePermission('activity:read');
  const write = requirePermission('activity:write');

  // ─── Gas analyses and flare efficiency evidence ────────────────────────────

  router.get('/flare-sources/:id/gas-compositions', read, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body: DataResponse<GasCompositionDto[]> = one(
      await inputs.listCompositions(organisationOf(req).id, id),
    );
    res.json(body);
  });
  router.post('/flare-sources/:id/gas-compositions', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body = parse(compositionCreateSchema, req.body);
    res.status(201).json(one(await inputs.createComposition(callerOf(req), id, body)));
  });
  router.post('/gas-compositions/:id/withdraw', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const { reason } = parse(withdrawInputSchema, req.body);
    res.json(one(await inputs.withdrawComposition(callerOf(req), id, reason)));
  });

  router.get('/flare-sources/:id/flare-efficiencies', read, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body: DataResponse<FlareEfficiencyDto[]> = one(
      await inputs.listEfficiencies(organisationOf(req).id, id),
    );
    res.json(body);
  });
  router.post('/flare-sources/:id/flare-efficiencies', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body = parse(efficiencyCreateSchema, req.body);
    res.status(201).json(one(await inputs.createEfficiency(callerOf(req), id, body)));
  });
  router.post('/flare-efficiencies/:id/withdraw', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const { reason } = parse(withdrawInputSchema, req.body);
    res.json(one(await inputs.withdrawEfficiency(callerOf(req), id, reason)));
  });

  // ─── Calculations ──────────────────────────────────────────────────────────

  router.get(
    '/activity-records/:id/calculations',
    requirePermission('calculation:read'),
    async (req, res) => {
      const { id } = parse(idParamSchema, req.params);
      const caller = callerOf(req);
      const body: DataResponse<CalculationDto[]> = one(
        await calculations.listForRecord(caller.organisationId, caller, id),
      );
      res.json(body);
    },
  );
  router.post(
    '/activity-records/:id/calculations',
    requirePermission('calculation:run'),
    async (req, res) => {
      const { id } = parse(idParamSchema, req.params);
      const body = parse(runSchema, req.body);
      res.status(201).json(one(await calculations.run(callerOf(req), id, body)));
    },
  );

  router.get('/calculations', requirePermission('calculation:read'), async (req, res) => {
    const query = parse(calculationListQuerySchema, req.query);
    const caller = callerOf(req);
    const { items, total } = await calculations.list(caller.organisationId, caller, query);
    const body: ListResponse<CalculationDto> = {
      data: items,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
    res.json(body);
  });
  router.get('/calculations/:id', requirePermission('calculation:read'), async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const caller = callerOf(req);
    res.json(one(await calculations.get(caller.organisationId, caller, id)));
  });
  router.get(
    '/calculations/:id/history',
    requirePermission('calculation:read'),
    async (req, res) => {
      const { id } = parse(idParamSchema, req.params);
      const body: DataResponse<CalculationEventDto[]> = one(
        await calculations.history(organisationOf(req).id, id),
      );
      res.json(body);
    },
  );

  for (const action of CALCULATION_ACTIONS) {
    router.post(
      `/calculations/:id/${action}`,
      requirePermission(CALCULATION_ACTION_GATES[action]),
      async (req, res) => {
        const { id } = parse(idParamSchema, req.params);
        const comment = CALCULATION_COMMENT_REQUIRED.includes(action)
          ? parse(requiredComment, req.body).comment
          : parse(optionalComment, req.body);
        res.json(one(await calculations.act(callerOf(req), id, action, comment)));
      },
    );
  }

  return router;
}
