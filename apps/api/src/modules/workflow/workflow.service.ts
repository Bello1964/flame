import {
  COMMENT_REQUIRED_ACTIONS,
  OVERLAP_BLOCKED_CODE,
  SEPARATION_OF_DUTIES_CODE,
  type ActivityAction,
  type ActivityRecordDto,
  type BulkActivityResult,
  type OverlapErrorDetails,
} from '@flame/shared';
import type {
  ActivityRecord,
  ActivityRecordEventType,
  ActivityRecordStatus,
  Prisma,
  PrismaClient,
} from '../../generated/prisma/client.js';
import type { Logger } from 'pino';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js';
import * as repo from '../activity/activity.repository.js';
import type { ActivityService, Caller } from '../activity/activity.service.js';
import type { Actor } from '../facilities/facilities.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { lockFlareSource } from '../facilities/facilities.repository.js';
import { refusalFor, type Refusal } from './workflow.rules.js';
import type { BulkInput } from './workflow.schemas.js';

/** Workflow actions that move a record between states (revise creates a new record). */
export type TransitionAction = Exclude<ActivityAction, 'edit' | 'withdraw' | 'revise'>;

interface Transition {
  to: ActivityRecordStatus;
  event: ActivityRecordEventType;
  audit: string;
}

const TRANSITIONS: Record<TransitionAction, Transition> = {
  submit: { to: 'SUBMITTED', event: 'SUBMITTED', audit: 'activity_record.submitted' },
  recall: { to: 'DRAFT', event: 'RECALLED', audit: 'activity_record.recalled' },
  'start-review': {
    to: 'UNDER_REVIEW',
    event: 'REVIEW_STARTED',
    audit: 'activity_record.review_started',
  },
  'release-claim': {
    to: 'SUBMITTED',
    event: 'CLAIM_RELEASED',
    audit: 'activity_record.claim_released',
  },
  forward: {
    to: 'AWAITING_APPROVAL',
    event: 'FORWARDED',
    audit: 'activity_record.forwarded',
  },
  return: { to: 'NEEDS_CORRECTION', event: 'RETURNED', audit: 'activity_record.returned' },
  approve: { to: 'APPROVED', event: 'APPROVED', audit: 'activity_record.approved' },
  reject: { to: 'REJECTED', event: 'REJECTED', audit: 'activity_record.rejected' },
};

function commentRequired(action: ActivityAction): boolean {
  return (COMMENT_REQUIRED_ACTIONS as readonly ActivityAction[]).includes(action);
}

function reasonMissing(): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Invalid request', {
    formErrors: [],
    fieldErrors: { comment: ['Give a reason'] },
  });
}

/** A refusal as the error the client sees. */
function refusalError(refusal: Refusal): AppError {
  switch (refusal.kind) {
    case 'permission':
      return forbidden();
    case 'separation':
      return new AppError(403, SEPARATION_OF_DUTIES_CODE, refusal.message);
    case 'state':
      return conflict(refusal.message);
  }
}

/**
 * Review and approval of activity records (ARCHITECTURAL_WORKFLOW.md §7.1).
 *
 * Every action runs in one transaction with the record locked (FOR UPDATE), so two people
 * acting at once can't both succeed: the second sees the new state and gets 409. The
 * rules come from workflow.rules.ts; each step writes a history event and an audit entry
 * in the same transaction. The database trigger rejects any illegal transition anyway.
 */
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly activity: ActivityService,
    private readonly logger: Logger,
  ) {}

  async act(
    caller: Caller,
    id: string,
    action: TransitionAction,
    comment: string | undefined,
  ): Promise<ActivityRecordDto> {
    if (commentRequired(action) && !comment) throw reasonMissing();
    await this.prisma.$transaction((tx) => this.apply(tx, caller, id, action, comment));
    return this.activity.get(caller.organisationId, caller, id);
  }

  /**
   * Applies one action to many records. Each record is handled in its own transaction,
   * so one refusal (or an unexpected failure) doesn't hold back the rest; the result says
   * what happened to each, including records committed before a later one failed.
   */
  async bulk(caller: Caller, input: BulkInput): Promise<BulkActivityResult[]> {
    if (commentRequired(input.action) && !input.comment) throw reasonMissing();
    const results: BulkActivityResult[] = [];
    for (const id of input.ids) {
      try {
        const status = await this.prisma.$transaction((tx) =>
          this.apply(tx, caller, id, input.action, input.comment),
        );
        results.push({ id, ok: true, status });
      } catch (err) {
        if (err instanceof AppError) {
          results.push({ id, ok: false, error: { code: err.code, message: err.message } });
          continue;
        }
        this.logger.error(
          { err, recordId: id, action: input.action, organisationId: caller.organisationId },
          'Bulk workflow action failed for one record',
        );
        results.push({
          id,
          ok: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Could not be updated because of an unexpected error. Try again.',
          },
        });
      }
    }
    return results;
  }

  /**
   * Starts a revision of an approved record: a new draft, prefilled with its values and
   * linked to it. The original stays approved (and in use) until the revision is approved.
   */
  async revise(caller: Caller, id: string): Promise<ActivityRecordDto> {
    const org = caller.organisationId;
    const revisionId = await this.prisma.$transaction(async (tx) => {
      await repo.lockRecord(tx, org, id);
      const original = await repo.findRecord(tx, org, id);
      if (!original) throw notFound('Activity record not found');
      await lockFlareSource(tx, org, original.flareSourceId);
      const source = await repo.findFlareSourceForActivity(tx, org, original.flareSourceId);
      if (!source) throw notFound('Flare source not found');
      const open = (await repo.revisionsOf(tx, org, [id])).some((v) =>
        repo.OPEN_REVISION_STATUSES.includes(v.status),
      );
      const refusal = refusalFor(
        'revise',
        this.activity.stateOf(original, source.status === 'ACTIVE', open),
        caller,
        { involved: new Set(), reviewers: new Set() },
      );
      if (refusal) throw refusalError(refusal);

      const revision = await tx.activityRecord.create({
        data: {
          ...valuesOf(original),
          revisionOfId: original.id,
          version: original.version + 1,
          createdById: caller.userId,
          updatedById: caller.userId,
        },
      });
      await repo.addEvent(tx, {
        organisationId: org,
        activityRecordId: revision.id,
        type: 'CREATED',
        fromStatus: null,
        toStatus: 'DRAFT',
        actorId: caller.userId,
        details: { relatedRecordId: original.id },
      });
      await repo.addEvent(tx, {
        organisationId: org,
        activityRecordId: original.id,
        type: 'REVISION_CREATED',
        fromStatus: 'APPROVED',
        toStatus: 'APPROVED',
        actorId: caller.userId,
        details: { relatedRecordId: revision.id },
      });
      await this.audit(tx, caller, 'activity_record.revision_created', revision.id, {
        revisionOf: original.id,
        version: revision.version,
      });
      return revision.id;
    });
    return this.activity.get(org, caller, revisionId);
  }

  /**
   * Releases every review claim a person holds in the organisation (records go back to
   * Submitted), recording a CLAIM_RELEASED step and an audit entry for each, exactly as a
   * manual release does. Used when the reviewer is removed from the organisation
   * (ARCHITECTURAL_WORKFLOW.md §7.2), inside the caller's transaction. Returns the count.
   */
  async releaseClaimsHeldBy(
    tx: Prisma.TransactionClient,
    actor: Actor,
    claimantId: string,
    comment: string,
  ): Promise<number> {
    const org = actor.organisationId;
    const claimed = await tx.activityRecord.findMany({
      where: { organisationId: org, status: 'UNDER_REVIEW', claimedById: claimantId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    let released = 0;
    for (const { id } of claimed) {
      await repo.lockRecord(tx, org, id);
      const record = await repo.findRecord(tx, org, id);
      if (record?.status !== 'UNDER_REVIEW' || record.claimedById !== claimantId) continue;
      const t = TRANSITIONS['release-claim'];
      await tx.activityRecord.update({
        where: { id },
        data: { status: t.to, updatedById: actor.userId, claimedById: null, claimedAt: null },
      });
      await repo.addEvent(tx, {
        organisationId: org,
        activityRecordId: id,
        type: t.event,
        fromStatus: record.status,
        toStatus: t.to,
        actorId: actor.userId,
        comment,
        details: { reason: 'member_removed', claimantId },
      });
      await recordAudit(tx, {
        organisationId: org,
        actorUserId: actor.userId,
        action: t.audit,
        entityType: 'ActivityRecord',
        entityId: id,
        metadata: {
          fromStatus: record.status,
          toStatus: t.to,
          comment,
          reason: 'member_removed',
          claimantId,
        },
        ipAddress: actor.ipAddress,
      });
      released += 1;
    }
    return released;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async apply(
    tx: Prisma.TransactionClient,
    caller: Caller,
    id: string,
    action: TransitionAction,
    comment: string | undefined,
  ): Promise<ActivityRecordStatus> {
    const org = caller.organisationId;
    // Lock order everywhere: activity records (a revision before its original), then the
    // flare source. Approval locks the original early to keep that order.
    await repo.lockRecord(tx, org, id);
    const record = await repo.findRecord(tx, org, id);
    if (!record) throw notFound('Activity record not found');
    if (action === 'approve' && record.revisionOfId) {
      await repo.lockRecord(tx, org, record.revisionOfId);
    }
    const checksOverlap = action === 'submit' || action === 'approve';
    // Serialises against other submissions and approvals for the same flare source.
    if (checksOverlap) await lockFlareSource(tx, org, record.flareSourceId);
    const source = await repo.findFlareSourceForActivity(tx, org, record.flareSourceId);
    if (!source) throw notFound('Flare source not found');

    const inv = (await repo.involvementOf(tx, org, [record])).get(id) ?? {
      involved: new Set<string>(),
      reviewers: new Set<string>(),
    };
    const refusal = refusalFor(
      action,
      this.activity.stateOf(record, source.status === 'ACTIVE', false),
      caller,
      inv,
    );
    if (refusal) throw refusalError(refusal);

    if (action === 'submit') await this.blockOverlaps(tx, record, repo.COMMITTED_STATUSES);
    if (action === 'approve') await this.blockOverlaps(tx, record, ['APPROVED']);

    const t = TRANSITIONS[action];
    const now = new Date();
    const claim =
      action === 'start-review'
        ? { claimedById: caller.userId, claimedAt: now }
        : { claimedById: null, claimedAt: null };
    await tx.activityRecord.update({
      where: { id },
      data: {
        status: t.to,
        updatedById: caller.userId,
        ...claim,
        ...(action === 'submit' ? { submittedAt: now } : {}),
        ...(action === 'approve' ? { approvedAt: now, approvedById: caller.userId } : {}),
      },
    });

    // Warnings as the submitter and approver saw them are kept with those steps.
    const details =
      action === 'submit' || action === 'approve'
        ? { warnings: await this.activity.currentWarnings(tx, record) }
        : undefined;
    await repo.addEvent(tx, {
      organisationId: org,
      activityRecordId: id,
      type: t.event,
      fromStatus: record.status,
      toStatus: t.to,
      actorId: caller.userId,
      comment: comment ?? null,
      ...(details ? { details: details as unknown as Prisma.InputJsonValue } : {}),
    });
    await this.audit(tx, caller, t.audit, id, {
      fromStatus: record.status,
      toStatus: t.to,
      ...(comment ? { comment } : {}),
      ...(details ? { warnings: details.warnings.map((w) => w.code) } : {}),
    });

    if (action === 'approve' && record.revisionOfId) {
      await this.supersede(tx, caller, record.revisionOfId, id, now);
    }
    return t.to;
  }

  /** An approved revision replaces the record it revises, in the same transaction. */
  private async supersede(
    tx: Prisma.TransactionClient,
    caller: Caller,
    originalId: string,
    revisionId: string,
    now: Date,
  ) {
    const org = caller.organisationId;
    const original = await repo.findRecord(tx, org, originalId);
    if (original?.status !== 'APPROVED') {
      throw conflict('The record this revises is no longer approved');
    }
    await tx.activityRecord.update({
      where: { id: originalId },
      data: { status: 'SUPERSEDED', supersededAt: now, updatedById: caller.userId },
    });
    await repo.addEvent(tx, {
      organisationId: org,
      activityRecordId: originalId,
      type: 'SUPERSEDED',
      fromStatus: 'APPROVED',
      toStatus: 'SUPERSEDED',
      actorId: caller.userId,
      details: { relatedRecordId: revisionId },
    });
    await this.audit(tx, caller, 'activity_record.superseded', originalId, {
      supersededBy: revisionId,
    });
  }

  /**
   * 409 OVERLAP_BLOCKED when the record overlaps another record in `statuses` for the same
   * flare source and activity type. The record it revises doesn't count: it is replaced.
   */
  private async blockOverlaps(
    tx: Prisma.TransactionClient,
    record: ActivityRecord,
    statuses: ActivityRecordStatus[],
  ) {
    const overlaps = await repo.findOverlapping(
      tx,
      record.organisationId,
      record.flareSourceId,
      record.activityType,
      record.periodStart,
      record.periodEnd,
      statuses,
      [record.id, record.revisionOfId],
    );
    if (overlaps.length === 0) return;
    const details: OverlapErrorDetails = {
      overlapping: overlaps.map((o) => ({
        id: o.id,
        periodStart: repo.isoDateOf(o.periodStart),
        periodEnd: repo.isoDateOf(o.periodEnd),
      })),
    };
    const n = overlaps.length;
    throw new AppError(
      409,
      OVERLAP_BLOCKED_CODE,
      `This record overlaps ${String(n)} ${statuses.length === 1 ? 'approved' : 'submitted or approved'} record${n === 1 ? '' : 's'} for the same flare source and activity type. Correct the period or activity type, or withdraw the duplicate.`,
      details,
    );
  }

  private audit(
    tx: Prisma.TransactionClient,
    caller: Caller,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return recordAudit(tx, {
      organisationId: caller.organisationId,
      actorUserId: caller.userId,
      action,
      entityType: 'ActivityRecord',
      entityId,
      metadata,
      ipAddress: caller.ipAddress,
    });
  }
}

/** The values a revision starts from: everything entered and standardised, no workflow state. */
function valuesOf(r: ActivityRecord): Prisma.ActivityRecordUncheckedCreateInput {
  return {
    organisationId: r.organisationId,
    flareSourceId: r.flareSourceId,
    kind: r.kind,
    activityType: r.activityType,
    otherTypeDescription: r.otherTypeDescription,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    timeZone: r.timeZone,
    averageRate: r.averageRate,
    averageRateInput: r.averageRateInput,
    rateUnit: r.rateUnit,
    totalVolume: r.totalVolume,
    totalVolumeInput: r.totalVolumeInput,
    volumeUnit: r.volumeUnit,
    operatingHours: r.operatingHours,
    operatingHoursInput: r.operatingHoursInput,
    referenceTemperature: r.referenceTemperature,
    referenceTemperatureInput: r.referenceTemperatureInput,
    referenceTemperatureUnit: r.referenceTemperatureUnit,
    referencePressure: r.referencePressure,
    referencePressureInput: r.referencePressureInput,
    referencePressureUnit: r.referencePressureUnit,
    zSource: r.zSource,
    zSourceInput: r.zSourceInput,
    zReference: r.zReference,
    zReferenceInput: r.zReferenceInput,
    compressibilitySource: r.compressibilitySource,
    measurementBasis: r.measurementBasis,
    estimateExplanation: r.estimateExplanation,
    measurementMethod: r.measurementMethod,
    methodDescription: r.methodDescription,
    dataSource: r.dataSource,
    notes: r.notes,
    standardRateMmscfd: r.standardRateMmscfd,
    standardVolumeMmscf: r.standardVolumeMmscf,
    derivedVolumeMmscf: r.derivedVolumeMmscf,
    correctionFactor: r.correctionFactor,
    conversionVersion: r.conversionVersion,
    conversionDetails: r.conversionDetails as Prisma.InputJsonValue,
    standardisedAt: r.standardisedAt,
    createdById: r.createdById,
    updatedById: r.updatedById,
  };
}
