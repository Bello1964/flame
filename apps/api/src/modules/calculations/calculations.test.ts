import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CalculationDto, MethodologyEditionDto } from '@flame/shared';
import {
  CSRF_HEADER,
  addMember,
  approvedMethodology,
  createOrganisation,
  createUser,
  login,
  makeApp,
  ownerPrisma,
  prisma,
  resetDatabase,
  seedMethodology,
  type LoggedIn,
} from '../../test/context.js';
import type { Role } from '../../generated/prisma/client.js';

const app = makeApp();
const API = '/api/v1';
const base = (orgId: string) => `${API}/organisations/${orgId}`;

function post(user: LoggedIn, path: string, body: object = {}) {
  return user.agent.post(path).set(CSRF_HEADER, user.csrfToken).send(body);
}
function patch(user: LoggedIn, path: string, body: object) {
  return user.agent.patch(path).set(CSRF_HEADER, user.csrfToken).send(body);
}

async function member(email: string, orgId: string, roles: Role[]) {
  const user = await createUser(email);
  await addMember(user.id, orgId, roles);
  return login(app, email);
}

async function admin(email: string) {
  const user = await createUser(email, { isPlatformAdmin: true });
  return { user, session: await login(app, email) };
}

/** API Compendium (2009) Exhibit 4.9 gas. */
const EXHIBIT_4_9 = {
  methane: '80',
  ethane: '4.2',
  propane: '1.3',
  isoButane: '0',
  normalButane: '0.4',
  isoPentane: '0',
  normalPentane: '0',
  hexanesPlus: '0',
  carbonDioxide: '12',
  nitrogen: '2.1',
  hydrogenSulphide: '0',
  otherInerts: '0',
};

interface World {
  org: string;
  orgB: string;
  owner: LoggedIn;
  entry: LoggedIn;
  reviewer: LoggedIn;
  approver: LoggedIn;
  viewer: LoggedIn;
  ownerB: LoggedIn;
  source: string;
}
let w: World;

async function hierarchy(user: LoggedIn, orgId: string) {
  const f = await post(user, `${base(orgId)}/facilities`, { name: 'Bonny', code: 'F-1' });
  const a = await post(user, `${base(orgId)}/assets`, {
    facilityId: f.body.data.id,
    name: 'A',
    code: 'A-1',
  });
  const s = await post(user, `${base(orgId)}/flare-sources`, {
    assetId: a.body.data.id,
    name: 'HP Flare',
    code: 'S-1',
  });
  expect(s.status).toBe(201);
  return s.body.data.id as string;
}

async function act(user: LoggedIn, path: string, action: string, body: object = {}) {
  const res = await post(user, `${path}/${action}`, body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as { data: Record<string, unknown> }).data;
}

/** An activity record taken through the review workflow to Approved. */
async function approvedRecord(day: string, overrides: Record<string, unknown> = {}) {
  const res = await post(w.entry, `${base(w.org)}/activity-records`, {
    flareSourceId: w.source,
    kind: 'DAILY',
    periodStart: day,
    activityType: 'ROUTINE_FLARING',
    totalVolume: { value: '20', unit: 'MMSCF' },
    referenceTemperature: { value: '15', unit: 'CELSIUS' },
    referencePressure: { value: '101.325', unit: 'KPA_ABS' },
    measurementBasis: 'MEASURED',
    measurementMethod: 'METERED',
    ...overrides,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const path = `${base(w.org)}/activity-records/${res.body.data.id as string}`;
  await act(w.entry, path, 'submit');
  await act(w.reviewer, path, 'start-review');
  await act(w.reviewer, path, 'forward');
  await act(w.approver, path, 'approve');
  return res.body.data.id as string;
}

function addComposition(validFrom = '2026-01-01', components = EXHIBIT_4_9, extra: object = {}) {
  return post(w.entry, `${base(w.org)}/flare-sources/${w.source}/gas-compositions`, {
    validFrom,
    sampleDate: validFrom,
    sampleReference: 'LAB-0423',
    components,
    ...extra,
  });
}

function run(user: LoggedIn, recordId: string, body: object) {
  return post(user, `${base(w.org)}/activity-records/${recordId}/calculations`, body);
}

beforeEach(async () => {
  await resetDatabase();
  const [a, b] = await Promise.all([createOrganisation('org-a'), createOrganisation('org-b')]);
  const owner = await member('owner@example.com', a.id, ['ORGANISATION_OWNER']);
  w = {
    org: a.id,
    orgB: b.id,
    owner,
    entry: await member('entry@example.com', a.id, ['DATA_ENTRY_OFFICER']),
    reviewer: await member('reviewer@example.com', a.id, ['REVIEWER']),
    approver: await member('approver@example.com', a.id, ['APPROVER']),
    viewer: await member('viewer@example.com', a.id, ['VIEWER']),
    ownerB: await member('owner-b@example.com', b.id, ['ORGANISATION_OWNER']),
    source: await hierarchy(owner, a.id),
  };
});

describe('the methodology registry', () => {
  it('publishes nothing until an edition is approved, and then anyone can read it', async () => {
    const id = await seedMethodology();
    const anonymous = request(app);
    expect((await anonymous.get(`${API}/methodology/editions`)).body.data).toEqual([]);
    expect((await anonymous.get(`${API}/methodology/editions/${id}`)).status).toBe(404);

    const { session } = await admin('admin@example.com');
    const approved = await post(session, `${API}/admin/methodology/editions/${id}/approve`);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);

    const list = await anonymous.get(`${API}/methodology/editions`);
    expect(list.body.data).toMatchObject([{ id, edition: 1, status: 'APPROVED' }]);
    const edition = (await anonymous.get(`${API}/methodology/editions/${id}`)).body
      .data as MethodologyEditionDto;
    expect(edition.parameters.find((p) => p.key === 'ipcc.direct.n2o')).toMatchObject({
      value: '0.000023',
      unit: 'Gg per 10⁶ m³ flared',
      sourceLocation: expect.stringContaining('Table 4.2.5, footnote e, p. 4.63'),
    });
    expect(edition.parameters.find((p) => p.key === 'gwp.ch4')?.value).toBe('28');
    expect(edition.content.decisions.map((d) => d.key)).toEqual(
      expect.arrayContaining(['molar-volume', 'n2o', 'gwp', 'efficiency', 'venting', 'excluded']),
    );
    for (const d of edition.content.decisions) {
      expect(d.reason.length).toBeGreaterThan(20);
      expect(d.references.length).toBeGreaterThan(0);
    }
  });

  it('keeps registry management to Platform Administrators', async () => {
    const id = await seedMethodology();
    expect((await post(w.owner, `${API}/admin/methodology/editions/${id}/approve`)).status).toBe(
      403,
    );
    expect((await w.owner.agent.get(`${API}/admin/methodology/editions`)).status).toBe(403);
    expect((await request(app).get(`${API}/admin/methodology/editions`)).status).toBe(401);
  });

  it('needs a second administrator to approve a new edition; the old one stays readable', async () => {
    const a = await admin('a@example.com');
    const b = await admin('b@example.com');
    const first = await approvedMethodology(b.user.id);

    const draft = await post(a.session, `${API}/admin/methodology/editions/${first}/draft`);
    expect(draft.status).toBe(201);
    const draftId = draft.body.data.id as string;
    expect(draft.body.data).toMatchObject({ edition: 2, status: 'DRAFT', canApprove: false });
    expect(draft.body.data.approvalBlockedReason).toMatch(/created this draft/);
    const edit = await patch(
      a.session,
      `${API}/admin/methodology/editions/${draftId}/parameters/gwp.ch4`,
      {
        value: '30',
        notes: 'Test edition',
      },
    );
    expect(edit.status).toBe(200);
    expect(
      (await post(a.session, `${API}/admin/methodology/editions/${draftId}/approve`)).status,
    ).toBe(409);

    const approved = await post(b.session, `${API}/admin/methodology/editions/${draftId}/approve`);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const old = await request(app).get(`${API}/methodology/editions/${first}`);
    expect(old.body.data).toMatchObject({ status: 'SUPERSEDED' });
    expect(old.body.data.parameters.find((p: { key: string }) => p.key === 'gwp.ch4').value).toBe(
      '28',
    );
    const current = await request(app).get(`${API}/methodology/editions/${draftId}`);
    expect(
      current.body.data.parameters.find((p: { key: string }) => p.key === 'gwp.ch4').value,
    ).toBe('30');
  });

  it('stops an administrator who edited a draft from approving it', async () => {
    const id = await seedMethodology();
    const a = await admin('a@example.com');
    await patch(a.session, `${API}/admin/methodology/editions/${id}/parameters/mw.ch4`, {
      notes: 'Checked',
    });
    const res = await post(a.session, `${API}/admin/methodology/editions/${id}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/edited this draft/);
  });

  it('never changes an approved edition', async () => {
    const a = await admin('a@example.com');
    const id = await approvedMethodology(a.user.id);
    const res = await patch(
      a.session,
      `${API}/admin/methodology/editions/${id}/parameters/gwp.ch4`,
      { value: '1' },
    );
    expect(res.status).toBe(409);
    await expect(
      ownerPrisma.$executeRaw`UPDATE methodology_parameters SET value = 1 WHERE "editionId" = ${id}::uuid AND key = 'gwp.ch4'`,
    ).rejects.toThrow(/cannot change/);
    await expect(
      ownerPrisma.$executeRaw`UPDATE methodology_editions SET title = 'x' WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/cannot change/);
  });
});

describe('gas analyses and flare efficiency', () => {
  it('requires the components to total 100% as entered, and a C6+ carbon number', async () => {
    const off = await addComposition('2026-01-01', { ...EXHIBIT_4_9, methane: '79' });
    expect(off.status).toBe(400);
    expect(off.body.error.details.fieldErrors.components[0]).toMatch(/total 99/);
    const noC6 = await addComposition('2026-01-01', {
      ...EXHIBIT_4_9,
      methane: '79',
      hexanesPlus: '1',
    });
    expect(noC6.status).toBe(400);
    expect(noC6.body.error.details.fieldErrors.hexanesPlusCarbonNumber).toBeDefined();
    const ok = await addComposition();
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({
      total: '100',
      status: 'ACTIVE',
      usedByCalculations: false,
    });
  });

  it('can be withdrawn with a reason but never edited or deleted', async () => {
    const created = (await addComposition()).body.data.id as string;
    expect(
      (await post(w.viewer, `${base(w.org)}/gas-compositions/${created}/withdraw`, { reason: 'x' }))
        .status,
    ).toBe(403);
    const res = await post(w.entry, `${base(w.org)}/gas-compositions/${created}/withdraw`, {
      reason: 'Wrong lab',
    });
    expect(res.body.data).toMatchObject({
      status: 'WITHDRAWN',
      withdrawal: { reason: 'Wrong lab' },
    });
    await expect(
      ownerPrisma.$executeRaw`UPDATE gas_compositions SET methane = 1 WHERE id = ${created}::uuid`,
    ).rejects.toThrow(/never edited/);
    await expect(
      prisma.$executeRaw`DELETE FROM gas_compositions WHERE id = ${created}::uuid`,
    ).rejects.toThrow(/permission denied/);
  });

  it('requires uncombusted methane and a test date for a measured efficiency', async () => {
    const res = await post(w.entry, `${base(w.org)}/flare-sources/${w.source}/flare-efficiencies`, {
      validFrom: '2026-01-01',
      basis: 'MEASURED_TEST',
      combustionEfficiencyPercent: '97.5',
      sourceReference: 'Test T-9',
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(
      expect.arrayContaining(['uncombustedMethanePercent', 'testDate']),
    );
  });

  it('hides another organisation’s flare source', async () => {
    expect(
      (await w.ownerB.agent.get(`${base(w.orgB)}/flare-sources/${w.source}/gas-compositions`))
        .status,
    ).toBe(404);
  });
});

describe('running a calculation', () => {
  it('refuses until an approved edition and the needed inputs exist, saying what is missing', async () => {
    const record = await approvedRecord('2026-01-10');
    const first = await run(w.entry, record, {
      route: 'COMPOSITION_FLARING',
      efficiencySource: 'METHODOLOGY_DEFAULT',
    });
    expect(first.status).toBe(409);
    expect(first.body.error.code).toBe('CALCULATION_BLOCKED');
    expect(first.body.error.details.missing.join(' ')).toMatch(/approved methodology edition/);
    expect(first.body.error.details.missing.join(' ')).toMatch(/gas analysis/);

    const a = await admin('a@example.com');
    await approvedMethodology(a.user.id);
    await addComposition();
    const second = await run(w.entry, record, {
      route: 'COMPOSITION_FLARING',
      efficiencySource: 'METHODOLOGY_DEFAULT',
    });
    expect(second.body.error.details.missing.join(' ')).toMatch(/production or refinery/);
    const third = await run(w.entry, record, {
      route: 'COMPOSITION_FLARING',
      efficiencySource: 'FLARE_RECORD',
    });
    expect(third.body.error.details.missing.join(' ')).toMatch(/tested or vendor flare efficiency/);
  });

  it('calculates composition-based flaring with the default efficiency, labelled estimated', async () => {
    const a = await admin('a@example.com');
    const editionId = await approvedMethodology(a.user.id);
    const record = await approvedRecord('2026-01-10');
    await addComposition();
    await patch(w.owner, `${base(w.org)}/flare-sources/${w.source}`, {
      flareService: 'PRODUCTION',
    });

    const res = await run(w.entry, record, {
      route: 'COMPOSITION_FLARING',
      efficiencySource: 'METHODOLOGY_DEFAULT',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const calc = res.body.data as CalculationDto;
    // Same inputs as API Exhibit 4.9 at 20 MMscf (hand-worked in engine.test.ts).
    expect(calc).toMatchObject({
      version: 1,
      status: 'CALCULATED',
      edition: { id: editionId, edition: 1 },
      volumeM3: '566336.93184',
      results: {
        co2Tonnes: '1096.73495923869817657344',
        ch4Tonnes: '6.149231131434172416',
        n2oTonnes: '0.01302574943232',
        co2eTonnes: '1272.36525451841980422144',
        gwp: { co2: '1', ch4: '28', n2o: '265' },
      },
      dataQuality: 'ESTIMATED',
      availableActions: ['submit', 'discard'],
    });
    expect(calc.qualityReasons.join(' ')).toMatch(/methodology default/);
    const ch4Step = calc.steps.find((s) => s.key === 'ch4');
    expect(ch4Step?.values).toContainEqual(
      expect.objectContaining({ parameterKey: 'api.ch4_uncombusted_production', value: '2' }),
    );
    // The inputs snapshot carries every parameter used, with its source.
    const params = (calc.inputs['parameters'] as { key: string; sourceLocation: string }[]).map(
      (p) => p.key,
    );
    expect(params).toEqual(
      expect.arrayContaining(['ipcc.molar_volume', 'ipcc.direct.n2o', 'gwp.ch4']),
    );

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: calc.id, action: 'calculation.created' },
    });
    expect(audit).not.toBeNull();
  });

  it('is "measured basis" with measured composition and a tested efficiency', async () => {
    const a = await admin('a@example.com');
    await approvedMethodology(a.user.id);
    const record = await approvedRecord('2026-01-10');
    await addComposition();
    await post(w.entry, `${base(w.org)}/flare-sources/${w.source}/flare-efficiencies`, {
      validFrom: '2025-12-01',
      basis: 'MEASURED_TEST',
      combustionEfficiencyPercent: '97.5',
      uncombustedMethanePercent: '2.5',
      sourceReference: 'Annual flare test T-9',
      testDate: '2025-11-20',
    });
    const res = await run(w.entry, record, {
      route: 'COMPOSITION_FLARING',
      efficiencySource: 'FLARE_RECORD',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ dataQuality: 'MEASURED_BASIS', qualityReasons: [] });
    const co2 = (res.body.data as CalculationDto).steps.find((s) => s.key === 'co2');
    expect(co2?.values).toContainEqual(
      expect.objectContaining({
        symbol: 'η',
        value: '97.5',
        origin: expect.stringContaining('Annual flare test T-9'),
      }),
    );
  });

  it('uses the IPCC reference case only with a reason', async () => {
    const a = await admin('a@example.com');
    await approvedMethodology(a.user.id);
    const record = await approvedRecord('2026-01-10');
    expect((await run(w.entry, record, { route: 'IPCC_REFERENCE_FLARING' })).status).toBe(400);
    const res = await run(w.entry, record, {
      route: 'IPCC_REFERENCE_FLARING',
      fallbackReason: 'No analysis yet',
    });
    expect(res.status).toBe(201);
    // 20 MMscf = 566,336.93184 m³; CO2 = 0.56633693184 × 2.0 × 1000.
    expect(res.body.data.results.co2Tonnes).toBe('1132.67386368');
    expect(res.body.data.dataQuality).toBe('ESTIMATED');
  });

  it('refuses unapproved records, wrong routes, a second open calculation and a split period', async () => {
    const a = await admin('a@example.com');
    await approvedMethodology(a.user.id);
    const draft = await post(w.entry, `${base(w.org)}/activity-records`, {
      flareSourceId: w.source,
      kind: 'DAILY',
      periodStart: '2026-02-01',
      activityType: 'ROUTINE_FLARING',
      totalVolume: { value: '1', unit: 'MMSCF' },
      referenceTemperature: { value: '15', unit: 'CELSIUS' },
      referencePressure: { value: '101.325', unit: 'KPA_ABS' },
      measurementBasis: 'MEASURED',
      measurementMethod: 'METERED',
    });
    const reason = { route: 'IPCC_REFERENCE_FLARING', fallbackReason: 'x' };
    expect((await run(w.entry, draft.body.data.id, reason)).status).toBe(409);

    const record = await approvedRecord('2026-01-10');
    expect((await run(w.entry, record, { route: 'COMPOSITION_VENTING' })).status).toBe(400);
    expect((await run(w.viewer, record, reason)).status).toBe(403);
    expect((await run(w.entry, record, reason)).status).toBe(201);
    expect((await run(w.entry, record, reason)).status).toBe(409);

    const period = await approvedRecord('2026-03-01', {
      kind: 'PERIOD',
      periodEnd: '2026-03-31',
    });
    await addComposition('2026-01-01');
    await addComposition('2026-03-15');
    const flaring = await run(w.entry, period, {
      route: 'COMPOSITION_FLARING',
      efficiencySource: 'FLARE_RECORD',
    });
    expect(flaring.body.error.details.missing.join(' ')).toMatch(
      /single gas analysis for the whole period/,
    );
  });

  it('hides another organisation’s records and calculations', async () => {
    const a = await admin('a@example.com');
    await approvedMethodology(a.user.id);
    const record = await approvedRecord('2026-01-10');
    const calc = await run(w.entry, record, {
      route: 'IPCC_REFERENCE_FLARING',
      fallbackReason: 'x',
    });
    expect(
      (
        await post(w.ownerB, `${base(w.orgB)}/activity-records/${record}/calculations`, {
          route: 'IPCC_REFERENCE_FLARING',
          fallbackReason: 'x',
        })
      ).status,
    ).toBe(404);
    expect(
      (await w.ownerB.agent.get(`${base(w.orgB)}/calculations/${calc.body.data.id as string}`))
        .status,
    ).toBe(404);
    expect((await w.ownerB.agent.get(`${base(w.orgB)}/calculations`)).body.data).toEqual([]);
  });
});

describe('reviewing calculations', () => {
  async function calculated(day = '2026-01-10') {
    const record = await approvedRecord(day);
    const res = await run(w.entry, record, {
      route: 'IPCC_REFERENCE_FLARING',
      fallbackReason: 'No analysis',
    });
    expect(res.status).toBe(201);
    return {
      record,
      path: `${base(w.org)}/calculations/${res.body.data.id as string}`,
      id: res.body.data.id as string,
    };
  }

  beforeEach(async () => {
    const a = await admin('a@example.com');
    await approvedMethodology(a.user.id);
  });

  it('goes through submit, review and approval by three different people', async () => {
    const { path } = await calculated();
    expect((await post(w.entry, `${path}/start-review`)).status).toBe(403);
    await act(w.entry, path, 'submit');
    await act(w.reviewer, path, 'start-review');
    await act(w.reviewer, path, 'forward');
    const approved = await act(w.approver, path, 'approve');
    expect(approved).toMatchObject({ status: 'APPROVED', approval: { byName: 'approver' } });

    const history = await w.viewer.agent.get(`${path}/history`);
    expect(history.body.data.map((e: { type: string }) => e.type)).toEqual([
      'CALCULATED',
      'SUBMITTED',
      'REVIEW_STARTED',
      'FORWARDED',
      'APPROVED',
    ]);
  });

  it('stops whoever ran a calculation from reviewing or approving it', async () => {
    const record = await approvedRecord('2026-01-10');
    const res = await run(w.owner, record, {
      route: 'IPCC_REFERENCE_FLARING',
      fallbackReason: 'x',
    });
    const path = `${base(w.org)}/calculations/${res.body.data.id as string}`;
    await act(w.owner, path, 'submit');
    const own = await post(w.owner, `${path}/start-review`);
    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe('SEPARATION_OF_DUTIES');
    await act(w.reviewer, path, 'start-review');
    await act(w.reviewer, path, 'forward');
    expect((await post(w.owner, `${path}/approve`)).status).toBe(403);
    await act(w.approver, path, 'approve');
  });

  it('requires reasons to reject or discard, and supersedes the previous approved version', async () => {
    const { record, path } = await calculated();
    expect((await post(w.entry, `${path}/discard`)).status).toBe(400);
    await act(w.entry, path, 'submit');
    await act(w.reviewer, path, 'start-review');
    await act(w.reviewer, path, 'forward');
    await act(w.approver, path, 'approve');

    const second = await run(w.entry, record, {
      route: 'IPCC_REFERENCE_FLARING',
      fallbackReason: 'Re-run',
    });
    expect(second.body.data.version).toBe(2);
    const path2 = `${base(w.org)}/calculations/${second.body.data.id as string}`;
    await act(w.entry, path2, 'submit');
    await act(w.reviewer, path2, 'start-review');
    await act(w.reviewer, path2, 'forward');
    await act(w.approver, path2, 'approve');
    expect((await w.viewer.agent.get(path)).body.data).toMatchObject({ status: 'SUPERSEDED' });

    const third = await run(w.entry, record, {
      route: 'IPCC_REFERENCE_FLARING',
      fallbackReason: 'Mistake',
    });
    const path3 = `${base(w.org)}/calculations/${third.body.data.id as string}`;
    await act(w.entry, path3, 'discard', { comment: 'Wrong route' });
    expect((await w.viewer.agent.get(path3)).body.data.status).toBe('DISCARDED');
  });

  it('flags calculations of a revised record and won’t approve them', async () => {
    const { record, path } = await calculated();
    await act(w.entry, path, 'submit');
    await act(w.reviewer, path, 'start-review');
    await act(w.reviewer, path, 'forward');
    // Revise the activity record and approve the revision (the original is superseded).
    const revision = await post(w.entry, `${base(w.org)}/activity-records/${record}/revise`);
    const revPath = `${base(w.org)}/activity-records/${revision.body.data.id as string}`;
    await act(w.entry, revPath, 'submit');
    await act(w.reviewer, revPath, 'start-review');
    await act(w.reviewer, revPath, 'forward');
    await act(w.approver, revPath, 'approve');

    const stale = await w.viewer.agent.get(path);
    expect(stale.body.data.activityRevised).toBe(true);
    const res = await post(w.approver, `${path}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/revised/);
  });

  it('never changes a calculation’s inputs or results in the database', async () => {
    const { id } = await calculated();
    await expect(
      ownerPrisma.$executeRaw`UPDATE calculations SET "co2eTonnes" = 1 WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/never change/);
    await expect(
      prisma.$executeRaw`DELETE FROM calculations WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/permission denied/);
    await expect(
      ownerPrisma.$executeRaw`UPDATE calculations SET status = 'APPROVED' WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/cannot move from CALCULATED to APPROVED/);
    await expect(
      ownerPrisma.$executeRaw`DELETE FROM calculation_events WHERE "calculationId" = ${id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  it('lists queues: submitted, and the ones I am reviewing', async () => {
    const one = await calculated('2026-01-10');
    const two = await calculated('2026-01-11');
    await act(w.entry, one.path, 'submit');
    await act(w.entry, two.path, 'submit');
    await act(w.reviewer, two.path, 'start-review');
    const queue = await w.reviewer.agent.get(
      `${base(w.org)}/calculations?status=SUBMITTED&sort=submitted`,
    );
    expect(queue.body.data.map((c: CalculationDto) => c.id)).toEqual([one.id]);
    const mine = await w.reviewer.agent.get(
      `${base(w.org)}/calculations?status=UNDER_REVIEW&claimedBy=me`,
    );
    expect(mine.body.data.map((c: CalculationDto) => c.id)).toEqual([two.id]);
  });
});

describe('review follow-ups', () => {
  beforeEach(async () => {
    const a = await admin('a@example.com');
    await approvedMethodology(a.user.id);
  });

  it('calculates venting from composition, with no N2O', async () => {
    const record = await approvedRecord('2026-02-10', { activityType: 'VENTING' });
    await addComposition();
    const res = await run(w.entry, record, { route: 'COMPOSITION_VENTING' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const calc = res.body.data as CalculationDto;
    expect(calc.results.n2oTonnes).toBeNull();
    expect(calc.dataQuality).toBe('MEASURED_BASIS');
    expect(calc.steps.map((s) => s.key)).toEqual(['volume', 'moles', 'ch4', 'co2', 'co2e']);
  });

  it('stops an owner who reviewed a calculation from approving it', async () => {
    const record = await approvedRecord('2026-01-10');
    const res = await run(w.entry, record, {
      route: 'IPCC_REFERENCE_FLARING',
      fallbackReason: 'x',
    });
    const path = `${base(w.org)}/calculations/${res.body.data.id as string}`;
    await act(w.entry, path, 'submit');
    await act(w.owner, path, 'start-review');
    await act(w.owner, path, 'forward');
    const own = await post(w.owner, `${path}/approve`);
    expect(own.status).toBe(403);
    expect(own.body.error.message).toMatch(/reviewed this calculation/);
    await act(w.approver, path, 'approve');
  });

  it('stops whoever submitted a calculation, not just whoever ran it, from reviewing it', async () => {
    const record = await approvedRecord('2026-01-10');
    const res = await run(w.entry, record, {
      route: 'IPCC_REFERENCE_FLARING',
      fallbackReason: 'x',
    });
    const path = `${base(w.org)}/calculations/${res.body.data.id as string}`;
    await act(w.owner, path, 'submit');
    expect((await post(w.owner, `${path}/start-review`)).body.error.code).toBe(
      'SEPARATION_OF_DUTIES',
    );
  });

  it('never lets the database record the runner as the approver', async () => {
    const record = await approvedRecord('2026-01-10');
    const res = await run(w.entry, record, {
      route: 'IPCC_REFERENCE_FLARING',
      fallbackReason: 'x',
    });
    const id = res.body.data.id as string;
    const path = `${base(w.org)}/calculations/${id}`;
    await act(w.entry, path, 'submit');
    await act(w.reviewer, path, 'start-review');
    await act(w.reviewer, path, 'forward');
    await expect(
      ownerPrisma.$executeRaw`UPDATE calculations SET status = 'APPROVED', "approvedAt" = now(), "approvedById" = "createdById" WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/calculations_two_person_check/);
  });

  it('hides another organisation’s inputs from withdrawal', async () => {
    const created = (await addComposition()).body.data.id as string;
    const res = await post(w.ownerB, `${base(w.orgB)}/gas-compositions/${created}/withdraw`, {
      reason: 'x',
    });
    expect(res.status).toBe(404);
  });
});

describe('methodology registry follow-ups', () => {
  it('can start again from a withdrawn edition while nothing has been approved', async () => {
    const id = await seedMethodology();
    const a = await admin('a@example.com');
    const b = await admin('b@example.com');
    await post(a.session, `${API}/admin/methodology/editions/${id}/withdraw`, {
      reason: 'Restart',
    });
    const draft = await post(a.session, `${API}/admin/methodology/editions/${id}/draft`);
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    expect(draft.body.data).toMatchObject({ edition: 2, status: 'DRAFT' });
    await post(
      b.session,
      `${API}/admin/methodology/editions/${draft.body.data.id as string}/approve`,
    );
    // Once an edition is published, drafts start from published editions only.
    const again = await post(a.session, `${API}/admin/methodology/editions/${id}/draft`);
    expect(again.status).toBe(409);
  });

  it('refuses values that would break or silence the calculation', async () => {
    const id = await seedMethodology();
    const a = await admin('a@example.com');
    const b = await admin('b@example.com');
    const path = `${API}/admin/methodology/editions/${id}/parameters`;
    expect((await patch(a.session, `${path}/gwp.ch4`, { value: '-28' })).status).toBe(400);
    expect((await patch(a.session, `${path}/conv.m3_per_mmscf`, { value: '0' })).status).toBe(400);
    expect(
      (await patch(a.session, `${path}/api.co2_conversion_default`, { value: '101' })).status,
    ).toBe(400);
    // A bad value that reached the draft some other way is refused at approval.
    await ownerPrisma.$executeRaw`UPDATE methodology_parameters SET value = 0 WHERE "editionId" = ${id}::uuid AND key = 'mw.ch4'`;
    const approve = await post(b.session, `${API}/admin/methodology/editions/${id}/approve`);
    expect(approve.status).toBe(409);
    expect(approve.body.error.message).toMatch(/mw\.ch4: must be greater than zero/);
  });

  it('names no people on the public page', async () => {
    const a = await admin('a@example.com');
    const id = await approvedMethodology(a.user.id);
    const res = await request(app).get(`${API}/methodology/editions/${id}`);
    expect(res.body.data).toMatchObject({ createdBy: null, approvedBy: null, status: 'APPROVED' });
    expect(JSON.stringify(res.body)).not.toContain(a.user.id);
  });
});
