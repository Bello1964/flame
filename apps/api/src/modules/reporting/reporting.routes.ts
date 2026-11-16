import { Router } from 'express';
import type { DataResponse, EmissionsReportDto, EmissionsTrendDto } from '@flame/shared';
import { parse } from '../../lib/request.js';
import { requirePermission } from '../../middleware/organisation-context.js';
import { callerOf, one } from '../activity/activity.routes.js';
import { reportCsv } from './csv.js';
import type { ReportingService } from './reporting.service.js';
import { filtersOf, reportQuerySchema, trendQuerySchema } from './reporting.schemas.js';

/**
 * Mounted under /organisations/:organisationId after requireAuth and requireOrganisation.
 * Read-only; the organisation always comes from the verified membership.
 */
export function reportingRouter(reporting: ReportingService): Router {
  const router = Router({ mergeParams: true });
  const read = requirePermission('report:read');

  router.get('/reports/emissions', read, async (req, res) => {
    const query = parse(reportQuerySchema, req.query);
    const caller = callerOf(req);
    const body: DataResponse<EmissionsReportDto> = one(
      await reporting.emissions(caller.organisationId, query.period, filtersOf(query)),
    );
    res.json(body);
  });

  router.get('/reports/emissions/trend', read, async (req, res) => {
    const query = parse(trendQuerySchema, req.query);
    const caller = callerOf(req);
    const body: DataResponse<EmissionsTrendDto> = one(
      await reporting.trend(caller.organisationId, query.endMonth, filtersOf(query)),
    );
    res.json(body);
  });

  router.get('/reports/emissions.csv', read, async (req, res) => {
    const query = parse(reportQuerySchema, req.query);
    const caller = callerOf(req);
    const report = await reporting.emissions(caller.organisationId, query.period, filtersOf(query));
    const csv = reportCsv(report);
    await reporting.recordExport(caller, report);
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="flame-emissions-${report.period.key}.csv"`,
        'Cache-Control': 'no-store',
      })
      .send(csv);
  });

  return router;
}
