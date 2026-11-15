import { beforeEach, describe, expect, it } from 'vitest';
import {
  CSRF_HEADER,
  addMember,
  createOrganisation,
  createUser,
  login,
  makeApp,
  prisma,
  resetDatabase,
  type LoggedIn,
} from '../../test/context.js';
import type { Role } from '../../generated/prisma/client.js';

const app = makeApp();
const base = (orgId: string) => `/api/v1/organisations/${orgId}`;

function post(user: LoggedIn, path: string, body: object) {
  return user.agent.post(path).set(CSRF_HEADER, user.csrfToken).send(body);
}
function patch(user: LoggedIn, path: string, body: object) {
  return user.agent.patch(path).set(CSRF_HEADER, user.csrfToken).send(body);
}

/** A date safely in the past in any time zone. */
const DAY = '2026-01-10';

interface World {
  orgA: { id: string };
  orgB: { id: string };
  ownerA: LoggedIn;
  viewerA: LoggedIn;
  ownerB: LoggedIn;
  sourceA: string;
}
let w: World;

async function memberWithRoles(email: string, orgId: string, roles: Role[]) {
  const user = await createUser(email);
  await addMember(user.id, orgId, roles);
  return login(app, email);
}

async function hierarchy(user: LoggedIn, orgId: string, suffix: string) {
  const f = await post(user, `${base(orgId)}/facilities`, {
    name: `F ${suffix}`,
    code: `F-${suffix}`,
  });
  const a = await post(user, `${base(orgId)}/assets`, {
    facilityId: f.body.data.id,
    name: `A ${suffix}`,
    code: `A-${suffix}`,
  });
  const s = await post(user, `${base(orgId)}/flare-sources`, {
    assetId: a.body.data.id,
    name: `S ${suffix}`,
    code: `S-${suffix}`,
  });
  expect(s.status).toBe(201);
  return s.body.data.id as string;
}

/** A valid daily, measured, metered record at the canonical condition. */
function daily(flareSourceId: string, overrides: Record<string, unknown> = {}) {
  return {
    flareSourceId,
    kind: 'DAILY',
    periodStart: DAY,
    activityType: 'ROUTINE_FLARING',
    averageRate: { value: '0.25', unit: 'MMSCF_PER_DAY' },
    operatingHours: '12',
    referenceTemperature: { value: '15', unit: 'CELSIUS' },
    referencePressure: { value: '101.325', unit: 'KPA_ABS' },
    measurementBasis: 'MEASURED',
    measurementMethod: 'METERED',
    ...overrides,
  };
}

const records = (orgId: string) => `${base(orgId)}/activity-records`;

beforeEach(async () => {
  await resetDatabase();
  const [orgA, orgB] = await Promise.all([
    createOrganisation('org-a'),
    createOrganisation('org-b'),
  ]);
  const [a1, a2, b1] = await Promise.all([
    createUser('owner-a@example.com'),
    createUser('viewer-a@example.com'),
    createUser('owner-b@example.com'),
  ]);
  await Promise.all([
    addMember(a1.id, orgA.id, ['ORGANISATION_OWNER']),
    addMember(a2.id, orgA.id, ['VIEWER']),
    addMember(b1.id, orgB.id, ['ORGANISATION_OWNER']),
  ]);
  const ownerA = await login(app, 'owner-a@example.com');
  w = {
    orgA,
    orgB,
    ownerA,
    viewerA: await login(app, 'viewer-a@example.com'),
    ownerB: await login(app, 'owner-b@example.com'),
    sourceA: await hierarchy(ownerA, orgA.id, '1'),
  };
});

describe('creating activity records', () => {
  it('stores the input exactly, standardises it, derives volume and audits it', async () => {
    const res = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, { averageRate: { value: '0.250', unit: 'MMSCF_PER_DAY' } }),
    );

    expect(res.status).toBe(201);
    const r = res.body.data;
    expect(r).toMatchObject({
      kind: 'DAILY',
      periodStart: DAY,
      periodEnd: DAY,
      timeZone: 'Africa/Lagos',
      averageRate: { value: '0.25', unit: 'MMSCF_PER_DAY', entered: '0.250' },
      operatingHours: { value: '12', entered: '12' },
      status: 'DRAFT',
      dataSource: 'MANUAL',
      zSource: null,
    });
    expect(r.standardised).toMatchObject({
      referenceCondition: 'ISO 13443 (15 °C, 101.325 kPa)',
      averageRateMmscfd: '0.25',
      derivedVolumeMmscf: '0.125',
      totalVolumeMmscf: null,
      correctionFactor: '1',
      conversionVersion: 'iso13443-real-gas-v1',
    });
    expect(r.warnings.map((x: { code: string }) => x.code)).toEqual(['NO_EVIDENCE']);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'activity_record.created', entityId: r.id },
    });
    expect(audit.organisationId).toBe(w.orgA.id);
    const stored = await prisma.activityRecord.findUniqueOrThrow({ where: { id: r.id } });
    expect(stored.conversionDetails).toMatchObject({
      canonicalCondition: { standard: 'ISO 13443' },
    });
  });

  it('standardises from another reference condition using both Z factors', async () => {
    const res = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, {
        averageRate: null,
        operatingHours: null,
        totalVolume: { value: '1', unit: 'MMSCF' },
        referenceTemperature: { value: '20', unit: 'CELSIUS' },
        zSource: '1',
        zReference: '1',
      }),
    );
    expect(res.status).toBe(201);
    // 288.15 / 293.15
    expect(res.body.data.standardised.totalVolumeMmscf.slice(0, 15)).toBe('0.9829438853829');
  });

  it('requires both Z factors off the canonical condition', async () => {
    const res = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, { referenceTemperature: { value: '60', unit: 'FAHRENHEIT' } }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.zSource[0]).toMatch(/compressibility/i);
  });

  it.each([
    [
      'an estimate without an explanation',
      { measurementBasis: 'ESTIMATED' },
      'estimateExplanation',
    ],
    ['method "Other" without a description', { measurementMethod: 'OTHER' }, 'methodDescription'],
    [
      '"other release" without a description',
      { activityType: 'OTHER_RELEASE' },
      'otherTypeDescription',
    ],
    ['no quantity at all', { averageRate: null, operatingHours: null }, 'averageRate'],
    [
      'more than 10 decimal places',
      { averageRate: { value: '0.12345678901', unit: 'MMSCF_PER_DAY' } },
      'averageRate',
    ],
    ['a negative rate', { averageRate: { value: '-1', unit: 'MMSCF_PER_DAY' } }, 'averageRate'],
    ['more than 24 hours in a day', { operatingHours: '24.5' }, 'operatingHours'],
    ['zero operating hours', { operatingHours: '0' }, 'operatingHours'],
    [
      'a period that ends before it starts',
      { kind: 'PERIOD', periodEnd: '2026-01-05' },
      'periodEnd',
    ],
    ['a period without an end', { kind: 'PERIOD' }, 'periodEnd'],
    ['a future date', { periodStart: '2099-01-01' }, 'periodStart'],
    ['an impossible date', { periodStart: '2026-02-30' }, 'periodStart'],
    [
      'gauge-style unit',
      { referencePressure: { value: '0', unit: 'KPA_GAUGE' } },
      'referencePressure',
    ],
    ['Z at the canonical condition', { zSource: '0.998', zReference: '0.998' }, 'zSource'],
  ])('rejects %s', async (_label, overrides, field) => {
    const res = await post(w.ownerA, records(w.orgA.id), daily(w.sourceA, overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details.fieldErrors)).toContain(field);
  });

  it('keeps an explicitly entered zero, and rejects unknown fields', async () => {
    const zero = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, {
        averageRate: null,
        operatingHours: null,
        totalVolume: { value: '0', unit: 'MMSCF' },
      }),
    );
    expect(zero.status).toBe(201);
    expect(zero.body.data.totalVolume.value).toBe('0');

    const sneaky = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, { organisationId: w.orgB.id }),
    );
    expect(sneaky.status).toBe(400);
  });

  it('caps operating hours by the length of a period', async () => {
    const ok = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, {
        kind: 'PERIOD',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-02',
        operatingHours: '48',
      }),
    );
    expect(ok.status).toBe(201);
    const tooMany = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, {
        kind: 'PERIOD',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-02',
        operatingHours: '48.5',
      }),
    );
    expect(tooMany.status).toBe(400);
  });

  it('refuses new records on an archived flare source', async () => {
    await post(w.ownerA, `${base(w.orgA.id)}/flare-sources/${w.sourceA}/archive`, {});
    const res = await post(w.ownerA, records(w.orgA.id), daily(w.sourceA));
    expect(res.status).toBe(409);
  });
});

describe('access', () => {
  it('lets data entry officers, administrators and owners write, and everyone read', async () => {
    const dataEntry = await memberWithRoles('de@example.com', w.orgA.id, ['DATA_ENTRY_OFFICER']);
    const admin = await memberWithRoles('admin@example.com', w.orgA.id, ['ADMINISTRATOR']);
    const reviewer = await memberWithRoles('rev@example.com', w.orgA.id, ['REVIEWER']);
    const approver = await memberWithRoles('app@example.com', w.orgA.id, ['APPROVER']);

    expect((await post(dataEntry, records(w.orgA.id), daily(w.sourceA))).status).toBe(201);
    expect(
      (await post(admin, records(w.orgA.id), daily(w.sourceA, { activityType: 'VENTING' }))).status,
    ).toBe(201);
    for (const user of [reviewer, approver, w.viewerA]) {
      expect((await post(user, records(w.orgA.id), daily(w.sourceA))).status).toBe(403);
      const list = await user.agent.get(records(w.orgA.id));
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBe(2);
    }
  });

  it('keeps organisations apart', async () => {
    const created = await post(w.ownerA, records(w.orgA.id), daily(w.sourceA));
    const id = created.body.data.id;

    // Org B cannot read A's record, nor record against A's flare source through its own org.
    expect((await w.ownerB.agent.get(`${records(w.orgB.id)}/${id}`)).status).toBe(404);
    expect((await w.ownerB.agent.get(`${records(w.orgA.id)}/${id}`)).status).toBe(404);
    expect((await post(w.ownerB, records(w.orgB.id), daily(w.sourceA))).status).toBe(404);
    expect((await patch(w.ownerB, `${records(w.orgB.id)}/${id}`, { notes: 'x' })).status).toBe(404);
    expect((await w.ownerB.agent.get(records(w.orgB.id))).body.meta.total).toBe(0);
  });
});

describe('overlapping records', () => {
  it('asks for confirmation, then saves with the confirmation recorded', async () => {
    const first = await post(w.ownerA, records(w.orgA.id), daily(w.sourceA));
    const second = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, { operatingHours: '6' }),
    );

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('OVERLAP_UNCONFIRMED');
    expect(second.body.error.details.overlapping).toEqual([
      { id: first.body.data.id, periodStart: DAY, periodEnd: DAY },
    ]);
    expect(await prisma.activityRecord.count()).toBe(1);

    const confirmed = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, { operatingHours: '6', acknowledgeOverlap: true }),
    );
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data.overlapAcknowledgedAt).not.toBeNull();
    expect(confirmed.body.data.warnings.map((x: { code: string }) => x.code)).toContain('OVERLAP');

    // The earlier record now shows the overlap too: warnings are worked out when read.
    const again = await w.ownerA.agent.get(`${records(w.orgA.id)}/${first.body.data.id}`);
    expect(again.body.data.warnings[0].overlapping[0].id).toBe(confirmed.body.data.id);
  });

  it('only compares the same activity type, and ignores withdrawn records', async () => {
    const flaring = await post(w.ownerA, records(w.orgA.id), daily(w.sourceA));
    expect(
      (await post(w.ownerA, records(w.orgA.id), daily(w.sourceA, { activityType: 'VENTING' })))
        .status,
    ).toBe(201);

    await post(w.ownerA, `${records(w.orgA.id)}/${flaring.body.data.id}/withdraw`, {
      reason: 'Duplicate',
    });
    expect((await post(w.ownerA, records(w.orgA.id), daily(w.sourceA))).status).toBe(201);
  });
});

describe('data-quality warnings', () => {
  it('flags rate × hours that differs from the entered volume by more than 1%', async () => {
    const res = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, {
        averageRate: { value: '1', unit: 'MMSCF_PER_DAY' },
        operatingHours: '24',
        totalVolume: { value: '1.5', unit: 'MMSCF' },
      }),
    );
    const mismatch = res.body.data.warnings.find(
      (x: { code: string }) => x.code === 'RATE_VOLUME_MISMATCH',
    );
    expect(mismatch.differencePercent).toBe('33.33');
    // Both values are kept exactly as entered; nothing is overwritten.
    expect(res.body.data.totalVolume.value).toBe('1.5');
  });

  it('does not flag differences within 1%', async () => {
    const res = await post(
      w.ownerA,
      records(w.orgA.id),
      daily(w.sourceA, {
        averageRate: { value: '1', unit: 'MMSCF_PER_DAY' },
        operatingHours: '24',
        totalVolume: { value: '1.005', unit: 'MMSCF' },
      }),
    );
    expect(res.body.data.warnings.map((x: { code: string }) => x.code)).toEqual(['NO_EVIDENCE']);
  });
});

describe('editing and withdrawing', () => {
  it('audits each changed field and writes nothing for an edit that changes nothing', async () => {
    const created = await post(w.ownerA, records(w.orgA.id), daily(w.sourceA));
    const url = `${records(w.orgA.id)}/${created.body.data.id}`;

    const edited = await patch(w.ownerA, url, { operatingHours: '10', notes: 'Meter checked' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.standardised.derivedVolumeMmscf).toBe('0.10416666666666666667');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'activity_record.updated' },
    });
    expect(audit.metadata).toMatchObject({
      changes: {
        operatingHours: { before: '12', after: '10' },
        notes: { before: null, after: 'Meter checked' },
      },
    });

    const same = await patch(w.ownerA, url, { notes: 'Meter checked' });
    expect(same.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'activity_record.updated' } })).toBe(1);
  });

  it('validates the record as a whole after the change', async () => {
    const created = await post(w.ownerA, records(w.orgA.id), daily(w.sourceA));
    const res = await patch(w.ownerA, `${records(w.orgA.id)}/${created.body.data.id}`, {
      measurementBasis: 'ESTIMATED',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.estimateExplanation).toBeDefined();
  });

  it('withdraws with a reason, then keeps the record read-only and out of the default list', async () => {
    const created = await post(w.ownerA, records(w.orgA.id), daily(w.sourceA));
    const url = `${records(w.orgA.id)}/${created.body.data.id}`;

    expect((await post(w.ownerA, `${url}/withdraw`, {})).status).toBe(400);
    const withdrawn = await post(w.ownerA, `${url}/withdraw`, {
      reason: 'Entered on the wrong day',
    });
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.data).toMatchObject({
      status: 'WITHDRAWN',
      withdrawal: { reason: 'Entered on the wrong day' },
      warnings: [],
    });

    expect((await patch(w.ownerA, url, { notes: 'x' })).status).toBe(409);
    expect((await post(w.ownerA, `${url}/withdraw`, { reason: 'again' })).status).toBe(409);
    expect((await w.ownerA.agent.get(records(w.orgA.id))).body.meta.total).toBe(0);
    expect((await w.ownerA.agent.get(`${records(w.orgA.id)}?status=ALL`)).body.meta.total).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'activity_record.withdrawn' } })).toBe(1);
  });
});

describe('organisation settings', () => {
  it('defaults to ISO 13443 and lets owners and administrators change it', async () => {
    const res = await w.viewerA.agent.get(`${base(w.orgA.id)}/settings`);
    expect(res.body.data).toEqual({
      defaultReferenceTemperature: { value: '15', unit: 'CELSIUS' },
      defaultReferencePressure: { value: '101.325', unit: 'KPA_ABS' },
    });

    const body = { defaultReferenceTemperature: { value: '60', unit: 'FAHRENHEIT' } };
    expect((await patch(w.viewerA, `${base(w.orgA.id)}/settings`, body)).status).toBe(403);
    const updated = await patch(w.ownerA, `${base(w.orgA.id)}/settings`, body);
    expect(updated.status).toBe(200);
    expect(updated.body.data.defaultReferenceTemperature).toEqual({
      value: '60',
      unit: 'FAHRENHEIT',
    });
    expect(
      await prisma.auditLog.count({ where: { action: 'organisation.settings_updated' } }),
    ).toBe(1);

    const bad = await patch(w.ownerA, `${base(w.orgA.id)}/settings`, {
      defaultReferenceTemperature: { value: '-500', unit: 'CELSIUS' },
    });
    expect(bad.status).toBe(400);
  });
});

describe('facility time zone', () => {
  it('defaults to Africa/Lagos and accepts only IANA zones', async () => {
    const ok = await post(w.ownerA, `${base(w.orgA.id)}/facilities`, {
      name: 'Accra',
      code: 'ACC',
      timeZone: 'Africa/Accra',
    });
    expect(ok.body.data.timeZone).toBe('Africa/Accra');
    const bad = await post(w.ownerA, `${base(w.orgA.id)}/facilities`, {
      name: 'Bad',
      code: 'BAD',
      timeZone: 'Mars/Olympus',
    });
    expect(bad.status).toBe(400);
  });
});

describe('database safeguards', () => {
  it('reject a record that breaks the rules even when application checks are bypassed', async () => {
    const created = await post(w.ownerA, records(w.orgA.id), daily(w.sourceA));
    await expect(
      prisma.activityRecord.update({
        where: { id: created.body.data.id },
        data: { averageRate: '-1' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.activityRecord.update({
        where: { id: created.body.data.id },
        data: { measurementBasis: 'ESTIMATED' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.activityRecord.update({
        where: { id: created.body.data.id },
        data: { status: 'WITHDRAWN' },
      }),
    ).rejects.toThrow();
  });
});
