import { Router, type Request } from 'express';
import type { DataResponse, ListResponse } from '@carbon/shared';
import { authOf, parse } from '../../lib/request.js';
import { organisationOf, requirePermission } from '../../middleware/organisation-context.js';
import type { Actor, FacilitiesService } from './facilities.service.js';
import { toAssetDto, toFacilityDto, toFlareSourceDto } from './facilities.mappers.js';
import {
  assetCreateSchema,
  assetListQuerySchema,
  assetUpdateSchema,
  facilityCreateSchema,
  facilityUpdateSchema,
  flareSourceCreateSchema,
  flareSourceListQuerySchema,
  flareSourceUpdateSchema,
  idParamSchema,
  listQuerySchema,
} from './facilities.schemas.js';

function actorOf(req: Request): Actor {
  return {
    organisationId: organisationOf(req).id,
    userId: authOf(req).userId,
    ipAddress: req.ip ?? null,
  };
}

function page<T>(items: T[], total: number, query: { page: number; pageSize: number }) {
  const body: ListResponse<T> = {
    data: items,
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
  return body;
}

function one<T>(data: T): DataResponse<T> {
  return { data };
}

/**
 * Mounted under /organisations/:organisationId after requireAuth and requireOrganisation.
 * Records are archived via POST /:id/archive; there are no DELETE endpoints.
 */
export function facilitiesRouter(service: FacilitiesService): Router {
  const router = Router({ mergeParams: true });
  const read = requirePermission('hierarchy:read');
  const write = requirePermission('hierarchy:write');

  // ─── Facilities ────────────────────────────────────────────────────────────

  router.get('/facilities', read, async (req, res) => {
    const query = parse(listQuerySchema, req.query);
    const { items, total } = await service.listFacilities(organisationOf(req).id, query);
    res.json(page(items.map(toFacilityDto), total, query));
  });

  router.post('/facilities', write, async (req, res) => {
    const body = parse(facilityCreateSchema, req.body);
    res.status(201).json(one(toFacilityDto(await service.createFacility(actorOf(req), body))));
  });

  router.get('/facilities/:id', read, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(one(toFacilityDto(await service.getFacility(organisationOf(req).id, id))));
  });

  router.patch('/facilities/:id', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body = parse(facilityUpdateSchema, req.body);
    res.json(one(toFacilityDto(await service.updateFacility(actorOf(req), id, body))));
  });

  router.post('/facilities/:id/archive', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(one(toFacilityDto(await service.archiveFacility(actorOf(req), id))));
  });

  // ─── Assets ────────────────────────────────────────────────────────────────

  router.get('/assets', read, async (req, res) => {
    const query = parse(assetListQuerySchema, req.query);
    const { items, total } = await service.listAssets(organisationOf(req).id, query);
    res.json(page(items.map(toAssetDto), total, query));
  });

  router.post('/assets', write, async (req, res) => {
    const body = parse(assetCreateSchema, req.body);
    res.status(201).json(one(toAssetDto(await service.createAsset(actorOf(req), body))));
  });

  router.get('/assets/:id', read, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(one(toAssetDto(await service.getAsset(organisationOf(req).id, id))));
  });

  router.patch('/assets/:id', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body = parse(assetUpdateSchema, req.body);
    res.json(one(toAssetDto(await service.updateAsset(actorOf(req), id, body))));
  });

  router.post('/assets/:id/archive', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(one(toAssetDto(await service.archiveAsset(actorOf(req), id))));
  });

  // ─── Flare sources ─────────────────────────────────────────────────────────

  router.get('/flare-sources', read, async (req, res) => {
    const query = parse(flareSourceListQuerySchema, req.query);
    const { items, total } = await service.listFlareSources(organisationOf(req).id, query);
    res.json(page(items.map(toFlareSourceDto), total, query));
  });

  router.post('/flare-sources', write, async (req, res) => {
    const body = parse(flareSourceCreateSchema, req.body);
    res
      .status(201)
      .json(one(toFlareSourceDto(await service.createFlareSource(actorOf(req), body))));
  });

  router.get('/flare-sources/:id', read, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(one(toFlareSourceDto(await service.getFlareSource(organisationOf(req).id, id))));
  });

  router.patch('/flare-sources/:id', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body = parse(flareSourceUpdateSchema, req.body);
    res.json(one(toFlareSourceDto(await service.updateFlareSource(actorOf(req), id, body))));
  });

  router.post('/flare-sources/:id/archive', write, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(one(toFlareSourceDto(await service.archiveFlareSource(actorOf(req), id))));
  });

  return router;
}
