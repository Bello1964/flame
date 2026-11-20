import { Router, type Response } from 'express';
import type {
  DataResponse,
  IssuedReportDto,
  IssuedReportSummaryDto,
  NuprcMonthlyLogDto,
  NuprcQuarterlyReportDto,
  NuprcReportKind,
} from '@flame/shared';
import { fieldErrors } from '../../lib/errors.js';
import { parse } from '../../lib/request.js';
import { requirePermission } from '../../middleware/organisation-context.js';
import { idParamSchema } from '../facilities/facilities.schemas.js';
import { callerOf, one } from '../activity/activity.routes.js';
import type { IssuedReportsService } from './issued-reports.service.js';
import {
  MONTHLY_PARTS,
  QUARTERLY_PARTS,
  monthlyCsv,
  quarterlyCsv,
  type MonthlyPart,
  type QuarterlyPart,
} from './nuprc-csv.js';
import type { NuprcService } from './nuprc.service.js';
import { parsePeriod } from './period.js';
import {
  issueReportSchema,
  issuedCsvQuerySchema,
  issuedListQuerySchema,
  nuprcMonthlyCsvQuerySchema,
  nuprcMonthlyQuerySchema,
  nuprcQuarterlyCsvQuerySchema,
  nuprcQuarterlyQuerySchema,
  rejectIssuedSchema,
  submissionSchema,
} from './reporting.schemas.js';

function sendCsv(res: Response, filename: string, csv: string): void {
  res
    .status(200)
    .set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    })
    .send(csv);
}

const SLUG: Record<NuprcReportKind, string> = {
  QUARTERLY_GHG_INVENTORY: 'nuprc-ghg-inventory',
  MONTHLY_FLARE_VENT_LOG: 'nuprc-flare-vent-log',
};

/**
 * NUPRC reports (ARCHITECTURAL_WORKFLOW.md §8.3), mounted under
 * /organisations/:organisationId. Live reports and CSVs need report:read; issuing,
 * approving, rejecting and recording a submission need report:issue.
 */
export function nuprcRouter(nuprc: NuprcService, issued: IssuedReportsService): Router {
  const router = Router({ mergeParams: true });
  const read = requirePermission('report:read');
  const issue = requirePermission('report:issue');

  const period = (key: string) => {
    const parsed = parsePeriod(key);
    if (!parsed) throw fieldErrors({ period: ['Unknown period'] });
    return parsed;
  };

  router.get('/reports/nuprc/quarterly', read, async (req, res) => {
    const query = parse(nuprcQuarterlyQuerySchema, req.query);
    const body: DataResponse<NuprcQuarterlyReportDto> = one(
      await nuprc.quarterly(callerOf(req).organisationId, period(query.period)),
    );
    res.json(body);
  });

  router.get('/reports/nuprc/quarterly.csv', read, async (req, res) => {
    const query = parse(nuprcQuarterlyCsvQuerySchema, req.query);
    const caller = callerOf(req);
    const report = await nuprc.quarterly(caller.organisationId, period(query.period));
    await issued.recordExport(caller, {
      kind: 'QUARTERLY_GHG_INVENTORY',
      period: query.period,
      part: query.part,
      issuedReportId: null,
    });
    sendCsv(
      res,
      `nuprc-ghg-inventory-${query.period}-${query.part}-live.csv`,
      quarterlyCsv(report, query.part),
    );
  });

  router.get('/reports/nuprc/monthly', read, async (req, res) => {
    const query = parse(nuprcMonthlyQuerySchema, req.query);
    const body: DataResponse<NuprcMonthlyLogDto> = one(
      await nuprc.monthly(callerOf(req).organisationId, period(query.period)),
    );
    res.json(body);
  });

  router.get('/reports/nuprc/monthly.csv', read, async (req, res) => {
    const query = parse(nuprcMonthlyCsvQuerySchema, req.query);
    const caller = callerOf(req);
    const log = await nuprc.monthly(caller.organisationId, period(query.period));
    await issued.recordExport(caller, {
      kind: 'MONTHLY_FLARE_VENT_LOG',
      period: query.period,
      part: query.part,
      issuedReportId: null,
    });
    sendCsv(
      res,
      `nuprc-flare-vent-log-${query.period}-${query.part}-live.csv`,
      monthlyCsv(log, query.part),
    );
  });

  // ─── Issued reports ────────────────────────────────────────────────────────

  router.get('/reports/issued', read, async (req, res) => {
    const query = parse(issuedListQuerySchema, req.query);
    const body: DataResponse<IssuedReportSummaryDto[]> = one(
      await issued.list(callerOf(req).organisationId, query),
    );
    res.json(body);
  });

  router.post('/reports/issued', issue, async (req, res) => {
    const input = parse(issueReportSchema, req.body);
    const body: DataResponse<IssuedReportDto> = one(await issued.issue(callerOf(req), input));
    res.status(201).json(body);
  });

  router.get('/reports/issued/:id', read, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body: DataResponse<IssuedReportDto> = one(
      await issued.get(callerOf(req).organisationId, id),
    );
    res.json(body);
  });

  router.get('/reports/issued/:id/csv', read, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const query = parse(issuedCsvQuerySchema, req.query);
    const caller = callerOf(req);
    const report = await issued.get(caller.organisationId, id);
    const snapshot = report.snapshot;
    let csv: string;
    let part: string;
    if (snapshot.kind === 'QUARTERLY_GHG_INVENTORY') {
      part = query.part ?? 'appendix-c';
      if (!(QUARTERLY_PARTS as readonly string[]).includes(part)) {
        throw fieldErrors({ part: [`Use one of: ${QUARTERLY_PARTS.join(', ')}`] });
      }
      csv = quarterlyCsv(snapshot, part as QuarterlyPart);
    } else {
      part = query.part ?? 'entries';
      if (!(MONTHLY_PARTS as readonly string[]).includes(part)) {
        throw fieldErrors({ part: [`Use one of: ${MONTHLY_PARTS.join(', ')}`] });
      }
      csv = monthlyCsv(snapshot, part as MonthlyPart);
    }
    await issued.recordExport(caller, {
      kind: report.kind,
      period: report.periodKey,
      part,
      issuedReportId: report.id,
    });
    sendCsv(
      res,
      `${SLUG[report.kind]}-${report.periodKey}-v${String(report.version)}${report.status === 'APPROVED' ? '' : `-${report.status.replace('_', '-')}`}-${part}.csv`,
      csv,
    );
  });

  router.post('/reports/issued/:id/approve', issue, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const body: DataResponse<IssuedReportDto> = one(await issued.approve(callerOf(req), id));
    res.json(body);
  });

  router.post('/reports/issued/:id/reject', issue, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const { comment } = parse(rejectIssuedSchema, req.body);
    const body: DataResponse<IssuedReportDto> = one(
      await issued.reject(callerOf(req), id, comment),
    );
    res.json(body);
  });

  router.post('/reports/issued/:id/submission', issue, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const input = parse(submissionSchema, req.body);
    const body: DataResponse<IssuedReportDto> = one(
      await issued.recordSubmission(callerOf(req), id, input),
    );
    res.json(body);
  });

  return router;
}
