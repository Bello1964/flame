import { Router } from 'express';
import type { DataResponse, OrganisationDto } from '@flame/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { organisationOf, requirePermission } from '../../middleware/organisation-context.js';
import { isDormant } from './locks.js';

/** Mounted under /organisations/:organisationId after requireOrganisation. */
export function organisationRouter(prisma: PrismaClient): Router {
  const router = Router({ mergeParams: true });

  router.get('/', requirePermission('organisation:read'), async (req, res) => {
    const ctx = organisationOf(req);
    const org = await prisma.organisation.findUniqueOrThrow({
      where: { id: ctx.id },
      select: { id: true, name: true, slug: true, country: true },
    });
    const response: DataResponse<OrganisationDto> = {
      data: { ...org, roles: ctx.roles, dormant: await isDormant(prisma, ctx.id) },
    };
    res.json(response);
  });

  return router;
}
