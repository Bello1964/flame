import {
  ISSUED_REPORT_ERROR_CODES,
  type IssuedReportDto,
  type IssuedReportSummaryDto,
  type NuprcReportDto,
  type NuprcReportKind,
} from '@flame/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError, conflict, fieldErrors, notFound } from '../../lib/errors.js';
import { isoDateOf } from '../activity/activity.repository.js';
import type { Caller } from '../activity/activity.service.js';
import { recordAudit } from '../audit/audit.service.js';
import type { NuprcService } from './nuprc.service.js';
import { parsePeriod } from './period.js';
import { todayIn } from '../../lib/dates.js';

/**
 * Calendar dates for issuing and submission rules are Nigerian local dates (the initial
 * market); organisations have no time zone of their own yet.
 */
const LOCAL_TIME_ZONE = 'Africa/Lagos';

const USER = { select: { id: true, name: true } } as const;
const INCLUDE = {
  issuedBy: USER,
  approvedBy: USER,
  rejectedBy: USER,
  submissionRecordedBy: USER,
} as const;

type IssuedRow = Prisma.IssuedReportGetPayload<{ include: typeof INCLUDE }>;

function toSummary(r: IssuedRow): IssuedReportSummaryDto {
  return {
    id: r.id,
    kind: r.kind,
    periodKey: r.periodKey,
    periodLabel: parsePeriod(r.periodKey)?.label ?? r.periodKey,
    version: r.version,
    status: r.status,
    reason: r.reason,
    issuedBy: r.issuedBy,
    issuedAt: r.issuedAt.toISOString(),
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    rejectedBy: r.rejectedBy,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    rejectionComment: r.rejectionComment,
    supersededAt: r.supersededAt?.toISOString() ?? null,
    submittedOn: r.submittedOn ? isoDateOf(r.submittedOn) : null,
    submissionReference: r.submissionReference,
    submissionRecordedBy: r.submissionRecordedBy,
    submissionRecordedAt: r.submissionRecordedAt?.toISOString() ?? null,
  };
}

const separation = (message: string) => new AppError(403, 'SEPARATION_OF_DUTIES', message);

/**
 * Issued NUPRC reports (ARCHITECTURAL_WORKFLOW.md §8.3): frozen snapshots that a different
 * Owner or Approver approves or rejects. A correction is a new version that supersedes the
 * approved one; nothing issued ever changes (database trigger).
 */
export class IssuedReportsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly nuprc: NuprcService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The live report for a kind and period key, as it would be issued now. */
  async build(
    organisationId: string,
    kind: NuprcReportKind,
    periodKey: string,
  ): Promise<NuprcReportDto> {
    const period = parsePeriod(periodKey);
    const expected = kind === 'QUARTERLY_GHG_INVENTORY' ? 'QUARTER' : 'MONTH';
    if (!period || period.granularity !== expected) {
      throw fieldErrors({
        period: [
          kind === 'QUARTERLY_GHG_INVENTORY'
            ? 'Use a quarter such as 2026-Q3'
            : 'Use a month such as 2026-07',
        ],
      });
    }
    return kind === 'QUARTERLY_GHG_INVENTORY'
      ? this.nuprc.quarterly(organisationId, period)
      : this.nuprc.monthly(organisationId, period);
  }

  async list(
    organisationId: string,
    filters: { kind?: NuprcReportKind | undefined; period?: string | undefined },
  ): Promise<IssuedReportSummaryDto[]> {
    const rows = await this.prisma.issuedReport.findMany({
      where: {
        organisationId,
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.period ? { periodKey: filters.period } : {}),
      },
      orderBy: [{ periodKey: 'desc' }, { kind: 'asc' }, { version: 'desc' }],
      include: INCLUDE,
    });
    return rows.map(toSummary);
  }

  async get(organisationId: string, id: string): Promise<IssuedReportDto> {
    const row = await this.prisma.issuedReport.findFirst({
      where: { id, organisationId },
      include: INCLUDE,
    });
    if (!row) throw notFound('Issued report not found');
    return { ...toSummary(row), snapshot: row.snapshot as unknown as NuprcReportDto };
  }

  /**
   * Serialises changes to the organisation's issued reports for the transaction. NO KEY
   * UPDATE does not conflict with the key-share locks that foreign-key checks take, so
   * other writes for the organisation are not held up.
   */
  private async lock(tx: Prisma.TransactionClient, organisationId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM organisations WHERE id = ${organisationId}::uuid FOR NO KEY UPDATE`;
  }

  async issue(
    caller: Caller,
    input: { kind: NuprcReportKind; period: string; reason?: string | undefined },
  ): Promise<IssuedReportDto> {
    const snapshot = await this.build(caller.organisationId, input.kind, input.period);
    const today = todayIn(LOCAL_TIME_ZONE, this.now());
    if (snapshot.period.end >= today) {
      throw fieldErrors({ period: ['A report can be issued only after its period has ended'] });
    }

    const id = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, caller.organisationId);
      const versions = await tx.issuedReport.findMany({
        where: { organisationId: caller.organisationId, kind: input.kind, periodKey: input.period },
        select: { version: true, status: true },
        orderBy: { version: 'desc' },
      });
      if (versions.some((v) => v.status === 'AWAITING_APPROVAL')) {
        throw new AppError(
          409,
          ISSUED_REPORT_ERROR_CODES.AWAITING_APPROVAL_EXISTS,
          'A version of this report is already awaiting approval: approve or reject it first',
        );
      }
      const version = (versions[0]?.version ?? 0) + 1;
      const reason = input.reason?.trim() ? input.reason.trim() : null;
      if (version > 1 && !reason) {
        throw new AppError(400, ISSUED_REPORT_ERROR_CODES.REASON_REQUIRED, 'Invalid request', {
          formErrors: [],
          fieldErrors: { reason: ['Say why this report is issued again'] },
        });
      }
      const created = await tx.issuedReport.create({
        data: {
          organisationId: caller.organisationId,
          kind: input.kind,
          periodKey: input.period,
          version,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          reason,
          issuedById: caller.userId,
        },
        select: { id: true },
      });
      await recordAudit(tx, {
        organisationId: caller.organisationId,
        actorUserId: caller.userId,
        action: 'report.issued',
        entityType: 'IssuedReport',
        entityId: created.id,
        metadata: { kind: input.kind, period: input.period, version, reason },
        ipAddress: caller.ipAddress,
      });
      return created.id;
    });
    return this.get(caller.organisationId, id);
  }

  async approve(caller: Caller, id: string): Promise<IssuedReportDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, caller.organisationId);
      const report = await tx.issuedReport.findFirst({
        where: { id, organisationId: caller.organisationId },
      });
      if (!report) throw notFound('Issued report not found');
      if (report.status !== 'AWAITING_APPROVAL') {
        throw conflict(`This report is ${report.status.toLowerCase().replace('_', ' ')}`);
      }
      if (report.issuedById === caller.userId) {
        throw separation('You issued this report, so someone else must approve it');
      }
      const now = this.now();
      const previous = await tx.issuedReport.findFirst({
        where: {
          organisationId: caller.organisationId,
          kind: report.kind,
          periodKey: report.periodKey,
          status: 'APPROVED',
        },
        select: { id: true, version: true },
      });
      if (previous) {
        await tx.issuedReport.update({
          where: { id: previous.id },
          data: { status: 'SUPERSEDED', supersededAt: now },
        });
      }
      await tx.issuedReport.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: caller.userId, approvedAt: now },
      });
      await recordAudit(tx, {
        organisationId: caller.organisationId,
        actorUserId: caller.userId,
        action: 'report.approved',
        entityType: 'IssuedReport',
        entityId: id,
        metadata: {
          kind: report.kind,
          period: report.periodKey,
          version: report.version,
          ...(previous ? { supersedes: previous.id, supersededVersion: previous.version } : {}),
        },
        ipAddress: caller.ipAddress,
      });
    });
    return this.get(caller.organisationId, id);
  }

  async reject(caller: Caller, id: string, comment: string): Promise<IssuedReportDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, caller.organisationId);
      const report = await tx.issuedReport.findFirst({
        where: { id, organisationId: caller.organisationId },
      });
      if (!report) throw notFound('Issued report not found');
      if (report.status !== 'AWAITING_APPROVAL') {
        throw conflict(`This report is ${report.status.toLowerCase().replace('_', ' ')}`);
      }
      if (report.issuedById === caller.userId) {
        throw separation('You issued this report, so someone else must review it');
      }
      await tx.issuedReport.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedById: caller.userId,
          rejectedAt: this.now(),
          rejectionComment: comment,
        },
      });
      await recordAudit(tx, {
        organisationId: caller.organisationId,
        actorUserId: caller.userId,
        action: 'report.rejected',
        entityType: 'IssuedReport',
        entityId: id,
        metadata: { kind: report.kind, period: report.periodKey, version: report.version, comment },
        ipAddress: caller.ipAddress,
      });
    });
    return this.get(caller.organisationId, id);
  }

  async recordSubmission(
    caller: Caller,
    id: string,
    input: { submittedOn: string; reference?: string | undefined },
  ): Promise<IssuedReportDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, caller.organisationId);
      const report = await tx.issuedReport.findFirst({
        where: { id, organisationId: caller.organisationId },
      });
      if (!report) throw notFound('Issued report not found');
      if (report.status !== 'APPROVED' && report.status !== 'SUPERSEDED') {
        throw conflict('Only an approved report can be recorded as submitted');
      }
      if (report.submittedOn) throw conflict('This report’s submission is already recorded');
      const today = todayIn(LOCAL_TIME_ZONE, this.now());
      const approvedOn = report.approvedAt ? todayIn(LOCAL_TIME_ZONE, report.approvedAt) : today;
      if (input.submittedOn > today || input.submittedOn < approvedOn) {
        throw fieldErrors({
          submittedOn: ['Use a date between the approval date and today'],
        });
      }
      const reference = input.reference?.trim() ? input.reference.trim() : null;
      await tx.issuedReport.update({
        where: { id },
        data: {
          submittedOn: new Date(`${input.submittedOn}T00:00:00Z`),
          submissionReference: reference,
          submissionRecordedById: caller.userId,
          submissionRecordedAt: this.now(),
        },
      });
      await recordAudit(tx, {
        organisationId: caller.organisationId,
        actorUserId: caller.userId,
        action: 'report.submission_recorded',
        entityType: 'IssuedReport',
        entityId: id,
        metadata: {
          kind: report.kind,
          period: report.periodKey,
          version: report.version,
          submittedOn: input.submittedOn,
          reference,
        },
        ipAddress: caller.ipAddress,
      });
    });
    return this.get(caller.organisationId, id);
  }

  /** Audits a CSV download of a live or issued NUPRC report. */
  async recordExport(
    caller: Caller,
    details: { kind: NuprcReportKind; period: string; part: string; issuedReportId: string | null },
  ): Promise<void> {
    await recordAudit(this.prisma, {
      organisationId: caller.organisationId,
      actorUserId: caller.userId,
      action: 'report.exported',
      entityType: details.issuedReportId ? 'IssuedReport' : 'nuprc_report',
      entityId: details.issuedReportId,
      metadata: { format: 'csv', kind: details.kind, period: details.period, part: details.part },
      ipAddress: caller.ipAddress,
    });
  }
}
