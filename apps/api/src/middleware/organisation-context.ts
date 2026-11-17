import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { withOrganisationScope } from '../lib/db-scope.js';
import { forbidden, notFound } from '../lib/errors.js';
import { hasPermission, type Permission } from '../modules/organisations/permissions.js';

const uuid = z.uuid();

/**
 * Establishes req.organisation from the authenticated user's ACTIVE membership of
 * :organisationId. The route parameter only says which organisation the client wants;
 * access comes from the membership row. Non-members get 404 so existence is not revealed.
 * Must run after requireAuth on a router created with { mergeParams: true }.
 *
 * Everything after it, the membership check included, runs in that organisation's
 * database scope: Row-Level Security hides every other organisation's rows (§11).
 */
export function requireOrganisation(prisma: PrismaClient): RequestHandler {
  return async (req, _res, next) => {
    const params = req.params as Record<string, string | undefined>;
    const organisationId = params['organisationId'];
    if (!req.auth || !uuid.safeParse(organisationId).success || organisationId === undefined) {
      next(notFound());
      return;
    }

    const userId = req.auth.userId;
    await withOrganisationScope(organisationId, async () => {
      const membership = await prisma.membership.findUnique({
        where: { userId_organisationId: { userId, organisationId } },
        select: { id: true, status: true, roles: true, organisation: { select: { status: true } } },
      });

      if (membership?.status !== 'ACTIVE' || membership.organisation.status !== 'ACTIVE') {
        next(notFound());
        return;
      }

      req.organisation = {
        id: organisationId,
        membershipId: membership.id,
        roles: membership.roles,
      };
      next();
    });
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.organisation || !hasPermission(req.organisation.roles, permission)) {
      next(forbidden());
      return;
    }
    next();
  };
}

/** Narrows req.organisation after requireOrganisation has run. */
export function organisationOf(req: Request): NonNullable<Request['organisation']> {
  if (!req.organisation) throw notFound();
  return req.organisation;
}
