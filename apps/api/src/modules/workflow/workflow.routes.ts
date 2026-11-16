import { Router, type RequestHandler } from 'express';
import type { BulkActivityResult, DataResponse, Permission } from '@flame/shared';
import { parse } from '../../lib/request.js';
import { requirePermission } from '../../middleware/organisation-context.js';
import { callerOf, one } from '../activity/activity.routes.js';
import { idParamSchema } from '../facilities/facilities.schemas.js';
import type { TransitionAction, WorkflowService } from './workflow.service.js';
import { bulkSchema, optionalCommentSchema, requiredCommentSchema } from './workflow.schemas.js';

/**
 * Review and approval endpoints (ARCHITECTURAL_WORKFLOW.md §7.1), mounted under
 * /organisations/:organisationId. The permission here is the coarse gate; the service
 * decides per record (state, claim, separation of duties) inside a transaction.
 * `return` and `release-claim` are open to more than one permission, so their gate is
 * activity:read and the service checks the rest.
 */
const GATES: Record<TransitionAction, Permission> = {
  submit: 'activity:submit',
  recall: 'activity:submit',
  'start-review': 'activity:review',
  'release-claim': 'activity:read',
  forward: 'activity:review',
  return: 'activity:read',
  approve: 'activity:approve',
  reject: 'activity:approve',
};

const REQUIRES_COMMENT = new Set<TransitionAction>(['release-claim', 'return', 'reject']);

export function workflowRouter(workflow: WorkflowService): Router {
  const router = Router({ mergeParams: true });

  const action = (name: TransitionAction): RequestHandler[] => [
    requirePermission(GATES[name]),
    async (req, res) => {
      const { id } = parse(idParamSchema, req.params);
      const comment = REQUIRES_COMMENT.has(name)
        ? parse(requiredCommentSchema, req.body).comment
        : parse(optionalCommentSchema, req.body);
      res.json(one(await workflow.act(callerOf(req), id, name, comment)));
    },
  ];

  for (const name of Object.keys(GATES) as TransitionAction[]) {
    router.post(`/activity-records/:id/${name}`, ...action(name));
  }

  router.post(
    '/activity-records/:id/revise',
    requirePermission('activity:write'),
    async (req, res) => {
      const { id } = parse(idParamSchema, req.params);
      res.status(201).json(one(await workflow.revise(callerOf(req), id)));
    },
  );

  router.post('/activity-records/bulk', requirePermission('activity:read'), async (req, res) => {
    const input = parse(bulkSchema, req.body);
    const body: DataResponse<BulkActivityResult[]> = one(await workflow.bulk(callerOf(req), input));
    res.json(body);
  });

  return router;
}
