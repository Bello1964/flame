import { Router } from 'express';
import type { DataResponse } from '@carbon/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { organisationOf, requirePermission } from '../../middleware/organisation-context.js';

interface OrganisationDto {
  id: string;
  name: string;
  slug: string;
  country: string;
  roles: string[];
}

/** Mounted under /organisations/:organisationId after requireOrganisation. */
export function organisationRouter(prisma: PrismaClient): Router {
  const router = Router({ mergeParams: true });

  router.get('/', requirePermission('organisation:read'), async (req, res) => {
    const ctx = organisationOf(req);
    const org = await prisma.organisation.findUniqueOrThrow({
      where: { id: ctx.id },
      select: { id: true, name: true, slug: true, country: true },
    });
    const response: DataResponse<OrganisationDto> = { data: { ...org, roles: ctx.roles } };
    res.json(response);
  });

  return router;
}
