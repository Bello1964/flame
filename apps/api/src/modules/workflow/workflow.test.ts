import { beforeEach, describe, expect, it } from 'vitest';
import type { ActivityRecordDto, ActivityRecordEventDto } from '@flame/shared';
import {
  CSRF_HEADER,
  addMember,
  createOrganisation,
  createUser,
  login,
  makeApp,
  ownerPrisma,
  prisma,
  resetDatabase,
  type LoggedIn,
} from '../../test/context.js';
import type { Role } from '../../generated/prisma/client.js';

const app = makeApp();
const base = (orgId: string) => `/api/v1/organisations/${orgId}`;
const records = (orgId: string) => `${base(orgId)}/activity-records`;

function post(user: LoggedIn, path: string, body: object = {}) {
  return user.agent.post(path).set(CSRF_HEADER, user.csrfToken).send(body);
}
function patch(user: LoggedIn, path: string, body: object) {
  return user.agent.patch(path).set(CSRF_HEADER, user.csrfToken).send(body);
}

interface World {
  orgA: string;
  orgB: string;
  owner: LoggedIn;
  entry: LoggedIn;
  entry2: LoggedIn;
  reviewer: LoggedIn;
  reviewer2: LoggedIn;
  approver: LoggedIn;
  admin: LoggedIn;
  viewer: LoggedIn;
  /** Data entry and reviewer roles: may review, but not records they worked on. */
  entryReviewer: LoggedIn;
  /** Reviewer and approver roles: may not approve what they reviewed. */
  reviewerApprover: LoggedIn;
  ownerB: LoggedIn;
  source: string;
}
let w: World;

async function member(email: string, orgId: string, roles: Role[]) {
  const user = await createUser(email);
  await addMember(user.id, orgId, roles);
  return login(app, email);
}

async function hierarchy(user: LoggedIn, orgId: string) {
  const f = await post(user, `${base(orgId)}/facilities`, { name: 'F', code: 'F-1' });
  const a = await post(user, `${base(orgId)}/assets`, {
    facilityId: f.body.data.id,
    name: 'A',
    code: 'A-1',
  });
  const s = await post(user, `${base(orgId)}/flare-sources`, {
    assetId: a.body.data.id,
    name: 'S',
    code: 'S-1',
  });
  expect(s.status).toBe(201);
  return s.body.data.id as string;
}

function daily(day: string, overrides: Record<string, unknown> = {}) {
  return {
    flareSourceId: w.source,
    kind: 'DAILY',
    periodStart: day,
    activityType: 'ROUTINE_FLARING',
    averageRate: { value: '0.25', unit: 'MMSCF_PER_DAY' },
    referenceTemperature: { value: '15', unit: 'CELSIUS' },
    referencePressure: { value: '101.325', unit: 'KPA_ABS' },
    measurementBasis: 'MEASURED',
    measurementMethod: 'METERED',
    ...overrides,
  };
}

async function create(user: LoggedIn, day: string, overrides: Record<string, unknown> = {}) {
  const res = await post(user, records(w.orgA), daily(day, overrides));
  expect(res.status).toBe(201);
  return res.body.data as ActivityRecordDto;
}

async function act(user: LoggedIn, id: string, action: string, body: object = {}) {
  return post(user, `${records(w.orgA)}/${id}/${action}`, body);
}

async function expectOk(user: LoggedIn, id: string, action: string, body: object = {}) {
  const res = await act(user, id, action, body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as ActivityRecordDto;
}

async function get(user: LoggedIn, id: string) {
  const res = await user.agent.get(`${records(w.orgA)}/${id}`);
  expect(res.status).toBe(200);
  return res.body.data as ActivityRecordDto;
}

async function history(user: LoggedIn, id: string) {
  const res = await user.agent.get(`${records(w.orgA)}/${id}/history`);
  expect(res.status).toBe(200);
  return res.body.data as ActivityRecordEventDto[];
}

/** Created by `entry`, submitted, reviewed by `reviewer` and approved by `approver`. */
async function approvedRecord(day: string) {
  const r = await create(w.entry, day);
  await expectOk(w.entry, r.id, 'submit');
  await expectOk(w.reviewer, r.id, 'start-review');
  await expectOk(w.reviewer, r.id, 'forward');
  return expectOk(w.approver, r.id, 'approve');
}

beforeEach(async () => {
  await resetDatabase();
  const [a, b] = await Promise.all([createOrganisation('org-a'), createOrganisation('org-b')]);
  const owner = await member('owner@example.com', a.id, ['ORGANISATION_OWNER']);
  w = {
    orgA: a.id,
    orgB: b.id,
    owner,
    entry: await member('entry@example.com', a.id, ['DATA_ENTRY_OFFICER']),
    entry2: await member('entry2@example.com', a.id, ['DATA_ENTRY_OFFICER']),
    reviewer: await member('reviewer@example.com', a.id, ['REVIEWER']),
    reviewer2: await member('reviewer2@example.com', a.id, ['REVIEWER']),
    approver: await member('approver@example.com', a.id, ['APPROVER']),
    admin: await member('admin@example.com', a.id, ['ADMINISTRATOR']),
    viewer: await member('viewer@example.com', a.id, ['VIEWER']),
    entryReviewer: await member('entry-reviewer@example.com', a.id, [
      'DATA_ENTRY_OFFICER',
      'REVIEWER',
    ]),
    reviewerApprover: await member('rev-app@example.com', a.id, ['REVIEWER', 'APPROVER']),
    ownerB: await member('owner-b@example.com', b.id, ['ORGANISATION_OWNER']),
    source: await hierarchy(owner, a.id),
  };
});

describe('the full path from draft to approved', () => {
  it('moves through each state, offering each person only their next step', async () => {
    const r = await create(w.entry, '2026-01-10');
    expect(r.availableActions).toEqual(['edit', 'withdraw', 'submit']);
    expect((await get(w.reviewer, r.id)).availableActions).toEqual([]);

    const submitted = await expectOk(w.entry, r.id, 'submit');
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.submittedAt).not.toBeNull();
    expect(submitted.availableActions).toEqual(['recall']);
    expect((await get(w.reviewer, r.id)).availableActions).toEqual(['start-review']);

    const claimed = await expectOk(w.reviewer, r.id, 'start-review');
    expect(claimed.status).toBe('UNDER_REVIEW');
    expect(claimed.claim).toMatchObject({ byName: 'reviewer' });
    expect(claimed.availableActions).toEqual(['release-claim', 'forward', 'return']);
    expect((await get(w.reviewer2, r.id)).availableActions).toEqual([]);
    expect((await get(w.owner, r.id)).availableActions).toEqual(['release-claim']);

    const forwarded = await expectOk(w.reviewer, r.id, 'forward', { comment: 'Checked meter' });
    expect(forwarded.status).toBe('AWAITING_APPROVAL');
    expect(forwarded.claim).toBeNull();
    expect((await get(w.approver, r.id)).availableActions).toEqual(['return', 'approve', 'reject']);

    const approved = await expectOk(w.approver, r.id, 'approve');
    expect(approved.status).toBe('APPROVED');
    expect(approved.approval).toMatchObject({ byName: 'approver' });
    expect(approved.availableActions).toEqual([]);
    expect((await get(w.entry, r.id)).availableActions).toEqual(['revise']);

    const events = await history(w.viewer, r.id);
    expect(events.map((e) => [e.type, e.actor.name])).toEqual([
      ['CREATED', 'entry'],
      ['SUBMITTED', 'entry'],
      ['REVIEW_STARTED', 'reviewer'],
      ['FORWARDED', 'reviewer'],
      ['APPROVED', 'approver'],
    ]);
    expect(events[3]?.comment).toBe('Checked meter');
    // The warnings the submitter and approver saw are kept with those steps.
    expect(events[1]?.warnings?.map((x) => x.code)).toEqual(['NO_EVIDENCE']);
    expect(events[4]?.warnings?.map((x) => x.code)).toEqual(['NO_EVIDENCE']);

    const audit = await prisma.auditLog.findMany({
      where: { entityId: r.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(audit.map((x) => x.action)).toEqual([
      'activity_record.created',
      'activity_record.submitted',
      'activity_record.review_started',
      'activity_record.forwarded',
      'activity_record.approved',
    ]);
  });

  it('lets the organisation owner review and approve, but not the same record', async () => {
    const r = await create(w.entry, '2026-01-10');
    await expectOk(w.entry, r.id, 'submit');
    await expectOk(w.owner, r.id, 'start-review');
    await expectOk(w.owner, r.id, 'forward');
    const res = await act(w.owner, r.id, 'approve');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SEPARATION_OF_DUTIES');
    await expectOk(w.approver, r.id, 'approve');
  });
});

describe('role permissions', () => {
  it('refuses each step to roles that do not hold it', async () => {
    const r = await create(w.entry, '2026-01-10');
    expect((await act(w.viewer, r.id, 'submit')).status).toBe(403);
    expect((await act(w.reviewer, r.id, 'submit')).status).toBe(403);
    await expectOk(w.entry, r.id, 'submit');

    expect((await act(w.entry2, r.id, 'start-review')).status).toBe(403);
    expect((await act(w.admin, r.id, 'start-review')).status).toBe(403);
    expect((await act(w.approver, r.id, 'start-review')).status).toBe(403);
    await expectOk(w.reviewer, r.id, 'start-review');
    await expectOk(w.reviewer, r.id, 'forward');

    expect((await act(w.reviewer2, r.id, 'approve')).status).toBe(403);
    expect((await act(w.admin, r.id, 'approve')).status).toBe(403);
    expect((await act(w.entry2, r.id, 'reject', { comment: 'x' })).status).toBe(403);
    expect((await act(w.viewer, r.id, 'return', { comment: 'x' })).status).toBe(403);
    await expectOk(w.approver, r.id, 'approve');
  });

  it('refuses actions that do not fit the record state with 409', async () => {
    const r = await create(w.entry, '2026-01-10');
    const res = await act(w.approver, r.id, 'approve');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/draft/);
    expect((await act(w.reviewer, r.id, 'forward')).status).toBe(409);
    expect((await act(w.entry, r.id, 'revise')).status).toBe(409);
  });
});

describe('separation of duties', () => {
  it('stops whoever created, edited or submitted a record from reviewing it', async () => {
    const created = await create(w.entryReviewer, '2026-01-10');
    await expectOk(w.entry, created.id, 'submit');
    const view = await get(w.entryReviewer, created.id);
    expect(view.availableActions).toEqual(['recall']);
    expect(view.separationOfDuties).toMatch(/entered, edited or submitted/);
    const res = await act(w.entryReviewer, created.id, 'start-review');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SEPARATION_OF_DUTIES');

    const edited = await create(w.entry, '2026-01-11');
    const edit = await patch(w.entryReviewer, `${records(w.orgA)}/${edited.id}`, { notes: 'n' });
    expect(edit.status).toBe(200);
    await expectOk(w.entry, edited.id, 'submit');
    expect((await act(w.entryReviewer, edited.id, 'start-review')).status).toBe(403);

    const submitted = await create(w.entry, '2026-01-12');
    await expectOk(w.entryReviewer, submitted.id, 'submit');
    expect((await act(w.entryReviewer, submitted.id, 'start-review')).status).toBe(403);
    await expectOk(w.reviewer, submitted.id, 'start-review');
  });

  it('stops the reviewer from also approving, even after the record is returned', async () => {
    const r = await create(w.entry, '2026-01-10');
    await expectOk(w.entry, r.id, 'submit');
    await expectOk(w.reviewerApprover, r.id, 'start-review');
    await expectOk(w.reviewerApprover, r.id, 'forward');
    const view = await get(w.reviewerApprover, r.id);
    expect(view.availableActions).toEqual([]);
    expect(view.separationOfDuties).toMatch(/reviewed this record/);
    expect((await act(w.reviewerApprover, r.id, 'approve')).body.error.code).toBe(
      'SEPARATION_OF_DUTIES',
    );

    // A second round with another reviewer doesn't clear the first reviewer.
    await expectOk(w.approver, r.id, 'return', { comment: 'Wrong day' });
    await expectOk(w.entry, r.id, 'submit');
    await expectOk(w.reviewer, r.id, 'start-review');
    await expectOk(w.reviewer, r.id, 'forward');
    expect((await act(w.reviewerApprover, r.id, 'approve')).status).toBe(403);
    await expectOk(w.approver, r.id, 'approve');
  });
});

describe('review claims', () => {
  it('lets only the claiming reviewer forward or return, and only them or the owner release', async () => {
    const r = await create(w.entry, '2026-01-10');
    await expectOk(w.entry, r.id, 'submit');
    await expectOk(w.reviewer, r.id, 'start-review');

    const other = await act(w.reviewer2, r.id, 'forward');
    expect(other.status).toBe(409);
    expect(other.body.error.message).toMatch(/Another reviewer/);
    expect((await act(w.reviewer2, r.id, 'start-review')).status).toBe(409);
    expect((await act(w.reviewer2, r.id, 'release-claim', { comment: 'mine' })).status).toBe(403);

    // A reason is required to release a claim.
    const noReason = await act(w.owner, r.id, 'release-claim');
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.details.fieldErrors.comment).toBeDefined();

    const released = await expectOk(w.owner, r.id, 'release-claim', { comment: 'On leave' });
    expect(released.status).toBe('SUBMITTED');
    expect(released.claim).toBeNull();
    await expectOk(w.reviewer2, r.id, 'start-review');
    await expectOk(w.reviewer2, r.id, 'release-claim', { comment: 'Not my area' });
    expect((await get(w.reviewer, r.id)).status).toBe('SUBMITTED');
  });

  it('lets only one of two simultaneous reviewers claim a record', async () => {
    const r = await create(w.entry, '2026-01-10');
    await expectOk(w.entry, r.id, 'submit');
    const results = await Promise.all([
      act(w.reviewer, r.id, 'start-review'),
      act(w.reviewer2, r.id, 'start-review'),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
    const events = await history(w.viewer, r.id);
    expect(events.filter((e) => e.type === 'REVIEW_STARTED')).toHaveLength(1);
  });

  it('filters the list to the records I am reviewing, oldest submission first', async () => {
    const first = await create(w.entry, '2026-01-10');
    const second = await create(w.entry, '2026-01-11');
    await expectOk(w.entry, first.id, 'submit');
    await expectOk(w.entry, second.id, 'submit');
    await expectOk(w.reviewer, second.id, 'start-review');

    const queue = await w.reviewer.agent.get(`${records(w.orgA)}?status=SUBMITTED&sort=submitted`);
    expect(queue.body.data.map((x: ActivityRecordDto) => x.id)).toEqual([first.id]);
    const mine = await w.reviewer.agent.get(`${records(w.orgA)}?status=UNDER_REVIEW&claimedBy=me`);
    expect(mine.body.data.map((x: ActivityRecordDto) => x.id)).toEqual([second.id]);
    const theirs = await w.reviewer2.agent.get(
      `${records(w.orgA)}?status=UNDER_REVIEW&claimedBy=me`,
    );
    expect(theirs.body.data).toEqual([]);
    expect(queue.body.data[0].flareSource).toMatchObject({ code: 'S-1', facilityName: 'F' });
  });
});

describe('recall, corrections, rejection and withdrawal', () => {
  it('lets someone involved recall a submission until a review starts', async () => {
    const r = await create(w.entry, '2026-01-10');
    await expectOk(w.entry, r.id, 'submit');
    expect((await act(w.entry2, r.id, 'recall')).status).toBe(409);
    const recalled = await expectOk(w.entry, r.id, 'recall');
    expect(recalled.status).toBe('DRAFT');

    await expectOk(w.entry, r.id, 'submit');
    await expectOk(w.reviewer, r.id, 'start-review');
    const late = await act(w.entry, r.id, 'recall');
    expect(late.status).toBe(409);
    expect(late.body.error.message).toMatch(/before its review starts/);
  });

  it('locks values while submitted and reopens them when returned for correction', async () => {
    const r = await create(w.entry, '2026-01-10');
    await expectOk(w.entry, r.id, 'submit');
    const locked = await patch(w.entry, `${records(w.orgA)}/${r.id}`, { notes: 'late' });
    expect(locked.status).toBe(409);
    expect(
      (await post(w.entry, `${records(w.orgA)}/${r.id}/withdraw`, { reason: 'x' })).status,
    ).toBe(409);

    await expectOk(w.reviewer, r.id, 'start-review');
    expect((await act(w.reviewer, r.id, 'return')).status).toBe(400);
    const returned = await expectOk(w.reviewer, r.id, 'return', { comment: 'Rate looks high' });
    expect(returned.status).toBe('NEEDS_CORRECTION');
    expect(returned.claim).toBeNull();

    // Anyone with activity:write may correct it, not just the submitter.
    const fixed = await patch(w.entry2, `${records(w.orgA)}/${r.id}`, {
      averageRate: { value: '0.2', unit: 'MMSCF_PER_DAY' },
    });
    expect(fixed.status).toBe(200);
    expect(fixed.body.data.status).toBe('NEEDS_CORRECTION');
    await expectOk(w.entry2, r.id, 'submit');

    const events = await history(w.viewer, r.id);
    expect(events.map((e) => e.type)).toEqual([
      'CREATED',
      'SUBMITTED',
      'REVIEW_STARTED',
      'RETURNED',
      'EDITED',
      'SUBMITTED',
    ]);
    expect(events[3]).toMatchObject({ comment: 'Rate looks high', toStatus: 'NEEDS_CORRECTION' });
  });

  it('allows withdrawing a record returned for correction', async () => {
    const r = await create(w.entry, '2026-01-10');
    await expectOk(w.entry, r.id, 'submit');
    await expectOk(w.reviewer, r.id, 'start-review');
    await expectOk(w.reviewer, r.id, 'return', { comment: 'Duplicate of another record' });
    const res = await post(w.entry, `${records(w.orgA)}/${r.id}/withdraw`, { reason: 'Duplicate' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('WITHDRAWN');
  });

  it('makes a rejection final, with a reason', async () => {
    const r = await create(w.entry, '2026-01-10');
    await expectOk(w.entry, r.id, 'submit');
    await expectOk(w.reviewer, r.id, 'start-review');
    await expectOk(w.reviewer, r.id, 'forward');
    expect((await act(w.approver, r.id, 'reject')).status).toBe(400);
    const rejected = await expectOk(w.approver, r.id, 'reject', { comment: 'Not our flare' });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.availableActions).toEqual([]);
    expect(rejected.warnings).toEqual([]);
    expect((await patch(w.entry, `${records(w.orgA)}/${r.id}`, { notes: 'x' })).status).toBe(409);
    expect((await act(w.entry, r.id, 'submit')).status).toBe(409);
    expect((await act(w.entry, r.id, 'revise')).status).toBe(409);
  });
});

describe('overlaps', () => {
  it('blocks submitting a record that overlaps a submitted or approved one', async () => {
    const first = await create(w.entry, '2026-01-10');
    await expectOk(w.entry, first.id, 'submit');

    const overlap = await post(w.entry, records(w.orgA), daily('2026-01-10'));
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('OVERLAP_UNCONFIRMED');
    const second = await post(w.entry, records(w.orgA), {
      ...daily('2026-01-10'),
      acknowledgeOverlap: true,
    });
    expect(second.status).toBe(201);

    const blocked = await act(w.entry, second.body.data.id, 'submit');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('OVERLAP_BLOCKED');
    expect(blocked.body.error.details.overlapping).toEqual([
      { id: first.id, periodStart: '2026-01-10', periodEnd: '2026-01-10' },
    ]);

    // Another activity type on the same day is a different record, not an overlap.
    const venting = await create(w.entry, '2026-01-10', { activityType: 'VENTING' });
    await expectOk(w.entry, venting.id, 'submit');
  });

  it('allows two overlapping drafts to be submitted one at a time only', async () => {
    const a = await create(w.entry, '2026-01-10');
    const b = await post(w.entry, records(w.orgA), {
      ...daily('2026-01-10'),
      acknowledgeOverlap: true,
    });
    await expectOk(w.entry, a.id, 'submit');
    expect((await act(w.entry, b.body.data.id, 'submit')).body.error.code).toBe('OVERLAP_BLOCKED');
    await expectOk(w.entry, a.id, 'recall');
    await expectOk(w.entry, b.body.data.id, 'submit');
  });
});

describe('revisions', () => {
  it('creates a linked draft, keeps the original approved, and supersedes it on approval', async () => {
    const original = await approvedRecord('2026-01-10');
    const res = await post(w.entry2, `${records(w.orgA)}/${original.id}/revise`);
    expect(res.status).toBe(201);
    const revision = res.body.data as ActivityRecordDto;
    expect(revision).toMatchObject({
      status: 'DRAFT',
      version: 2,
      revisionOfId: original.id,
      averageRate: original.averageRate,
      standardised: { averageRateMmscfd: '0.25' },
    });
    // The original (and a revision of it) doesn't count as overlapping.
    expect(revision.warnings.map((x) => x.code)).toEqual(['NO_EVIDENCE']);

    const stillApproved = await get(w.entry, original.id);
    expect(stillApproved).toMatchObject({ status: 'APPROVED', openRevisionId: revision.id });
    expect(stillApproved.availableActions).toEqual([]);
    expect((await post(w.entry, `${records(w.orgA)}/${original.id}/revise`)).status).toBe(409);

    await patch(w.entry2, `${records(w.orgA)}/${revision.id}`, {
      averageRate: { value: '0.3', unit: 'MMSCF_PER_DAY' },
    });
    await expectOk(w.entry2, revision.id, 'submit');
    await expectOk(w.reviewer, revision.id, 'start-review');
    await expectOk(w.reviewer, revision.id, 'forward');
    const approved = await expectOk(w.approver, revision.id, 'approve');
    expect(approved.status).toBe('APPROVED');

    const superseded = await get(w.viewer, original.id);
    expect(superseded).toMatchObject({
      status: 'SUPERSEDED',
      supersededById: revision.id,
      openRevisionId: null,
      averageRate: { value: '0.25' },
      warnings: [],
    });
    expect(superseded.supersededAt).not.toBeNull();
    expect((await history(w.viewer, original.id)).map((e) => e.type)).toEqual([
      'CREATED',
      'SUBMITTED',
      'REVIEW_STARTED',
      'FORWARDED',
      'APPROVED',
      'REVISION_CREATED',
      'SUPERSEDED',
    ]);
    expect((await post(w.entry, `${records(w.orgA)}/${original.id}/revise`)).status).toBe(409);

    // The current list shows the revision, not the record it replaced.
    const list = await w.viewer.agent.get(records(w.orgA));
    expect(list.body.data.map((x: ActivityRecordDto) => x.id)).toEqual([revision.id]);
  });

  it('treats the revision as a new record for separation of duties', async () => {
    const original = await approvedRecord('2026-01-10');
    // The original's approver revises it, so they can't approve the revision.
    const revisionRes = await post(w.owner, `${records(w.orgA)}/${original.id}/revise`);
    const revision = revisionRes.body.data as ActivityRecordDto;
    await expectOk(w.owner, revision.id, 'submit');
    await expectOk(w.reviewer, revision.id, 'start-review');
    await expectOk(w.reviewer, revision.id, 'forward');
    expect((await act(w.owner, revision.id, 'approve')).status).toBe(403);
    // The original's approver may approve the revision: they weren't involved in it.
    await expectOk(w.approver, revision.id, 'approve');
  });

  it('leaves the original approved when a revision is rejected, and allows a new one', async () => {
    const original = await approvedRecord('2026-01-10');
    const revision = (await post(w.entry2, `${records(w.orgA)}/${original.id}/revise`)).body
      .data as ActivityRecordDto;
    await expectOk(w.entry2, revision.id, 'submit');
    await expectOk(w.reviewer, revision.id, 'start-review');
    await expectOk(w.reviewer, revision.id, 'forward');
    await expectOk(w.approver, revision.id, 'reject', { comment: 'No change needed' });

    const after = await get(w.entry, original.id);
    expect(after).toMatchObject({ status: 'APPROVED', openRevisionId: null });
    expect(after.availableActions).toEqual(['revise']);
    const again = await post(w.entry, `${records(w.orgA)}/${original.id}/revise`);
    expect(again.status).toBe(201);
    expect(again.body.data.version).toBe(2);
  });
});

describe('bulk actions', () => {
  it('applies the action to each record and reports what happened to each', async () => {
    const a = await create(w.entry, '2026-01-10');
    const b = await create(w.entry, '2026-01-11');
    const c = await create(w.entry, '2026-01-12');
    await expectOk(w.entry, c.id, 'submit');

    const res = await post(w.entry, `${records(w.orgA)}/bulk`, {
      action: 'submit',
      ids: [a.id, b.id, c.id],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: a.id, ok: true, status: 'SUBMITTED' },
      { id: b.id, ok: true, status: 'SUBMITTED' },
      { id: c.id, ok: false, error: { code: 'CONFLICT', message: expect.any(String) } },
    ]);

    const review = await post(w.reviewer, `${records(w.orgA)}/bulk`, {
      action: 'start-review',
      ids: [a.id, b.id],
    });
    expect(review.body.data.every((x: { ok: boolean }) => x.ok)).toBe(true);
  });

  it('requires a reason for returns and rejections, and validates the ids', async () => {
    const a = await create(w.entry, '2026-01-10');
    const noReason = await post(w.reviewer, `${records(w.orgA)}/bulk`, {
      action: 'return',
      ids: [a.id],
    });
    expect(noReason.status).toBe(400);
    const dupes = await post(w.entry, `${records(w.orgA)}/bulk`, {
      action: 'submit',
      ids: [a.id, a.id],
    });
    expect(dupes.status).toBe(400);
    const unknown = await post(w.entry, `${records(w.orgA)}/bulk`, {
      action: 'withdraw',
      ids: [a.id],
    });
    expect(unknown.status).toBe(400);
  });

  it('refuses records the user may not act on, one by one', async () => {
    const a = await create(w.entry, '2026-01-10');
    const res = await post(w.viewer, `${records(w.orgA)}/bulk`, { action: 'submit', ids: [a.id] });
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect((await get(w.entry, a.id)).status).toBe('DRAFT');
  });
});

describe('tenant isolation', () => {
  it('hides another organisation’s records from every workflow endpoint', async () => {
    const r = await create(w.entry, '2026-01-10');
    const other = (path: string, body: object = {}) =>
      post(w.ownerB, `${records(w.orgB)}/${r.id}/${path}`, body);
    expect((await other('submit')).status).toBe(404);
    expect((await other('revise')).status).toBe(404);
    expect((await w.ownerB.agent.get(`${records(w.orgB)}/${r.id}/history`)).status).toBe(404);
    // Naming the other organisation in the URL doesn't help: there's no membership.
    expect((await post(w.ownerB, `${records(w.orgA)}/${r.id}/submit`)).status).toBe(404);

    const bulk = await post(w.ownerB, `${records(w.orgB)}/bulk`, { action: 'submit', ids: [r.id] });
    expect(bulk.body.data[0]).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect((await get(w.entry, r.id)).status).toBe('DRAFT');
  });
});

describe('database safeguards', () => {
  it('freezes approved values and rejects illegal transitions, even for the schema owner', async () => {
    const r = await approvedRecord('2026-01-10');
    await expect(
      ownerPrisma.$executeRaw`UPDATE activity_records SET "notes" = 'tampered' WHERE id = ${r.id}::uuid`,
    ).rejects.toThrow(/cannot change/);
    await expect(
      prisma.$executeRaw`UPDATE activity_records SET status = 'DRAFT' WHERE id = ${r.id}::uuid`,
    ).rejects.toThrow(/cannot move from APPROVED to DRAFT/);
    await expect(
      ownerPrisma.$executeRaw`DELETE FROM activity_records WHERE id = ${r.id}::uuid`,
    ).rejects.toThrow(/never deleted/);
    await expect(
      prisma.$executeRaw`DELETE FROM activity_records WHERE id = ${r.id}::uuid`,
    ).rejects.toThrow(/permission denied/);
  });

  it('freezes submitted values while allowing the workflow to move them on', async () => {
    const r = await create(w.entry, '2026-01-10');
    await expectOk(w.entry, r.id, 'submit');
    await expect(
      prisma.$executeRaw`UPDATE activity_records SET "averageRateInput" = '9' WHERE id = ${r.id}::uuid`,
    ).rejects.toThrow(/values cannot change/);
    await expect(
      prisma.$executeRaw`UPDATE activity_records SET status = 'APPROVED' WHERE id = ${r.id}::uuid`,
    ).rejects.toThrow(/cannot move from SUBMITTED to APPROVED/);
  });

  it('keeps the record history append-only', async () => {
    const r = await create(w.entry, '2026-01-10');
    await expect(
      prisma.$executeRaw`UPDATE activity_record_events SET comment = 'x' WHERE "activityRecordId" = ${r.id}::uuid`,
    ).rejects.toThrow(/permission denied/);
    await expect(
      ownerPrisma.$executeRaw`DELETE FROM activity_record_events WHERE "activityRecordId" = ${r.id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });
});
