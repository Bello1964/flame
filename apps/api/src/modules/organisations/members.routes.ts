import { Router } from 'express';
import type { DataResponse, InvitationDto, MemberDto, MemberRemovalDto } from '@flame/shared';
import { parse } from '../../lib/request.js';
import { requirePermission } from '../../middleware/organisation-context.js';
import { callerOf, one } from '../activity/activity.routes.js';
import type { InvitationsService } from './invitations.service.js';
import type { MembersService } from './members.service.js';
import {
  invitationCreateSchema,
  invitationParamSchema,
  memberListQuerySchema,
  memberRolesSchema,
  membershipParamSchema,
} from './members.schemas.js';

/**
 * Members and invitations of one organisation (ARCHITECTURAL_WORKFLOW.md §7.2), mounted
 * under /organisations/:organisationId after requireOrganisation. The organisation always
 * comes from the verified membership; the services enforce the Owner, self-change and
 * last-Owner rules on top of these permission gates.
 */
export function membersRouter(members: MembersService, invitations: InvitationsService): Router {
  const router = Router({ mergeParams: true });
  const read = requirePermission('members:read');
  const manage = requirePermission('members:manage');

  router.get('/members', read, async (req, res) => {
    const query = parse(memberListQuerySchema, req.query);
    const body: DataResponse<MemberDto[]> = one(
      await members.list(callerOf(req), query.includeRemoved === 'true'),
    );
    res.json(body);
  });

  router.patch('/members/:membershipId', manage, async (req, res) => {
    const { membershipId } = parse(membershipParamSchema, req.params);
    const { roles } = parse(memberRolesSchema, req.body);
    const body: DataResponse<MemberDto> = one(
      await members.updateRoles(callerOf(req), membershipId, roles),
    );
    res.json(body);
  });

  for (const action of ['suspend', 'reinstate'] as const) {
    router.post(`/members/:membershipId/${action}`, manage, async (req, res) => {
      const { membershipId } = parse(membershipParamSchema, req.params);
      const body: DataResponse<MemberDto> = one(
        await members.setSuspended(callerOf(req), membershipId, action),
      );
      res.json(body);
    });
  }

  router.post('/members/:membershipId/remove', manage, async (req, res) => {
    const { membershipId } = parse(membershipParamSchema, req.params);
    const body: DataResponse<MemberRemovalDto> = one(
      await members.remove(callerOf(req), membershipId),
    );
    res.json(body);
  });

  router.get('/invitations', read, async (req, res) => {
    const body: DataResponse<InvitationDto[]> = one(
      await invitations.listForOrganisation(callerOf(req).organisationId),
    );
    res.json(body);
  });

  router.post('/invitations', manage, async (req, res) => {
    const input = parse(invitationCreateSchema, req.body);
    const body: DataResponse<InvitationDto> = one(
      await invitations.createForOrganisation(callerOf(req), input),
    );
    res.status(201).json(body);
  });

  router.post('/invitations/:invitationId/revoke', manage, async (req, res) => {
    const { invitationId } = parse(invitationParamSchema, req.params);
    const body: DataResponse<InvitationDto> = one(
      await invitations.revokeForOrganisation(callerOf(req), invitationId),
    );
    res.json(body);
  });

  return router;
}
