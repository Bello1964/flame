import { Router, type Request, type RequestHandler } from 'express';
import type {
  DataResponse,
  InvitationDto,
  PlatformAdminRemovalDto,
  PlatformAdminsDto,
  PlatformOrganisationDto,
} from '@flame/shared';
import { forbidden } from '../../lib/errors.js';
import { authOf, parse } from '../../lib/request.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { one } from '../activity/activity.routes.js';
import type { PlatformActor, PlatformAdminService } from './platform-admin.service.js';
import {
  emailBodySchema,
  invitationParamSchema,
  organisationCreateSchema,
  organisationParamSchema,
  userParamSchema,
} from './platform-admin.schemas.js';

/** Platform-level operations only; grants no access to any organisation's data. */
const requirePlatformAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth?.isPlatformAdmin) {
    next(forbidden('Only Platform Administrators can do this'));
    return;
  }
  next();
};

function actorOf(req: Request): PlatformActor {
  return { userId: authOf(req).userId, ipAddress: req.ip ?? null };
}

/**
 * Mounted at /admin (ARCHITECTURAL_WORKFLOW.md §7.2): organisations and their first
 * Owner invitation, Platform Administrators and their invitations.
 */
export function platformAdminRouter(admin: PlatformAdminService): Router {
  const router = Router();
  router.use(requireAuth, requirePlatformAdmin);

  router.get('/organisations', async (_req, res) => {
    const body: DataResponse<PlatformOrganisationDto[]> = one(await admin.listOrganisations());
    res.json(body);
  });

  router.post('/organisations', async (req, res) => {
    const input = parse(organisationCreateSchema, req.body);
    const body: DataResponse<PlatformOrganisationDto> = one(
      await admin.createOrganisation(actorOf(req), input),
    );
    res.status(201).json(body);
  });

  router.post('/organisations/:organisationId/owner-invitation', async (req, res) => {
    const { organisationId } = parse(organisationParamSchema, req.params);
    const { email } = parse(emailBodySchema, req.body);
    const body: DataResponse<InvitationDto> = one(
      await admin.inviteOwner(actorOf(req), organisationId, email),
    );
    res.status(201).json(body);
  });

  router.post('/invitations/:invitationId/revoke', async (req, res) => {
    const { invitationId } = parse(invitationParamSchema, req.params);
    const body: DataResponse<InvitationDto> = one(
      await admin.revokeInvitation(actorOf(req), invitationId),
    );
    res.json(body);
  });

  router.get('/platform-admins', async (req, res) => {
    const body: DataResponse<PlatformAdminsDto> = one(
      await admin.listPlatformAdmins(authOf(req).userId),
    );
    res.json(body);
  });

  router.post('/platform-admins/invitations', async (req, res) => {
    const { email } = parse(emailBodySchema, req.body);
    const body: DataResponse<InvitationDto> = one(
      await admin.invitePlatformAdmin(actorOf(req), email),
    );
    res.status(201).json(body);
  });

  router.post('/platform-admins/:userId/remove', async (req, res) => {
    const { userId } = parse(userParamSchema, req.params);
    const body: DataResponse<PlatformAdminRemovalDto> = one(
      await admin.removePlatformAdmin(actorOf(req), userId),
    );
    res.json(body);
  });

  return router;
}
