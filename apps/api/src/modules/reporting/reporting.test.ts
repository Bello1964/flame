import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import type { CalculationDto, EmissionsReportDto, EmissionsTrendDto } from '@flame/shared';
import {
  CSRF_HEADER,
  addMember,
  approvedMethodology,
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
const API = '/api/v1';
const base = (orgId: string) => `${API}/organisations/${orgId}`;
const D = Prisma.Decimal.clone({ precision: 80 });

function post(user: LoggedIn, path: string, body: object = {}) {
  return user.agent.post(path).set(CSRF_HEADER, user.csrfToken).send(body);
}

async function member(email: string, orgId: string, roles: Role[]) {
  const user = await createUser(email);
  await addMember(user.id, orgId, roles);
  return login(app, email);
}

interface World {
  org: string;
  orgB: string;
  owner: LoggedIn;
  entry: LoggedIn;
  reviewer: LoggedIn;
  approver: LoggedIn;
  viewer: LoggedIn;
  ownerB: LoggedIn;
  facility: string;
  source: string;
}
let w: World;

async function act(user: LoggedIn, path: string, action: string, body: object = {}) {
  const res = await post(user, `${path}/${action}`, body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as { data: Record<string, unknown> }).data;
}

/** An activity record (20 MMscf, measured) created as a draft. */
async function draftRecord(start: string, overrides: Record<string, unknown> = {}) {
  const res = await post(w.entry, `${base(w.org)}/activity-records`, {
    flareSourceId: w.source,
    kind: 'DAILY',
    periodStart: start,
    activityType: 'ROUTINE_FLARING',
    totalVolume: { value: '20', unit: 'MMSCF' },
    referenceTemperature: { value: '15', unit: 'CELSIUS' },
    referencePressure: { value: '101.325', unit: 'KPA_ABS' },
    measurementBasis: 'MEASURED',
    measurementMethod: 'METERED',
    ...overrides,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

async function approve(recordId: string) {
  const path = `${base(w.org)}/activity-records/${recordId}`;
  await act(w.entry, path, 'submit');
  await act(w.reviewer, path, 'start-review');
  await act(w.reviewer, path, 'forward');
  await act(w.approver, path, 'approve');
  return recordId;
}

async function approvedRecord(start: string, overrides: Record<string, unknown> = {}) {
  return approve(await draftRecord(start, overrides));
}

/** Runs a calculation; with `approveIt`, takes it through review to Approved. */
async function calculation(recordId: string, approveIt = true, body?: object) {
  const res = await post(w.entry, `${base(w.org)}/activity-records/${recordId}/calculations`, {
    ...(body ?? { route: 'IPCC_REFERENCE_FLARING', fallbackReason: 'No analysis yet' }),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const calc = res.body.data as CalculationDto;
  if (approveIt) {
    const path = `${base(w.org)}/calculations/${calc.id}`;
    await act(w.entry, path, 'submit');
    await act(w.reviewer, path, 'start-review');
    await act(w.reviewer, path, 'forward');
    await act(w.approver, path, 'approve');
  }
  return calc;
}

async function report(period: string, query = '', user: LoggedIn = w.viewer) {
  const res = await user.agent.get(`${base(w.org)}/reports/emissions?period=${period}${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as EmissionsReportDto;
}

const routine = (r: EmissionsReportDto) =>
  r.summary.byType.find((t) => t.activityType === 'ROUTINE_FLARING');

beforeEach(async () => {
  await resetDatabase();
  const [a, b] = await Promise.all([createOrganisation('org-a'), createOrganisation('org-b')]);
  const owner = await member('owner@example.com', a.id, ['ORGANISATION_OWNER']);
  const f = await post(owner, `${base(a.id)}/facilities`, { name: 'Bonny', code: 'F-1' });
  const asset = await post(owner, `${base(a.id)}/assets`, {
    facilityId: f.body.data.id,
    name: 'Flow station',
    code: 'A-1',
  });
  const s = await post(owner, `${base(a.id)}/flare-sources`, {
    assetId: asset.body.data.id,
    name: 'HP Flare',
    code: 'S-1',
  });
  w = {
    org: a.id,
    orgB: b.id,
    owner,
    entry: await member('entry@example.com', a.id, ['DATA_ENTRY_OFFICER']),
    reviewer: await member('reviewer@example.com', a.id, ['REVIEWER']),
    approver: await member('approver@example.com', a.id, ['APPROVER']),
    viewer: await member('viewer@example.com', a.id, ['VIEWER']),
    ownerB: await member('owner-b@example.com', b.id, ['ORGANISATION_OWNER']),
    facility: f.body.data.id as string,
    source: s.body.data.id as string,
  };
  const admin = await createUser('admin@example.com', { isPlatformAdmin: true });
  await approvedMethodology(admin.id);
});

describe('what counts in a report', () => {
  it('sums approved calculations only and counts what is missing', async () => {
    const counted = await calculation(await approvedRecord('2026-01-10'));
    await calculation(await approvedRecord('2026-01-11'), false); // in progress
    await approvedRecord('2026-01-12'); // no calculation
    await draftRecord('2026-01-13'); // not yet approved

    const r = await report('2026-01');
    expect(r.basis).toMatch(/Approved calculations only\. Not carbon credits/);
    expect(r.period).toMatchObject({ start: '2026-01-01', end: '2026-01-31', days: 31 });
    const row = routine(r);
    expect(row?.emissions).toMatchObject({
      calculationCount: 1,
      co2eTonnes: counted.results.co2eTonnes,
      estimatedCo2eTonnes: counted.results.co2eTonnes,
      measuredBasisCo2eTonnes: '0',
      volumeCalculatedMmscf: '20',
    });
    expect(row?.approvedVolumeMmscf).toBe('60');
    expect(row?.coverage).toEqual({
      approvedRecords: 3,
      approvedRecordsCalculated: 1,
      approvedRecordsAwaitingCalculation: 2,
      calculationsInProgress: 1,
      recordsNotYetApproved: 1,
      openRevisions: 0,
      approvedRecordsWithoutVolume: 0,
    });
    expect(r.summary.total?.co2eTonnes).toBe(counted.results.co2eTonnes);
    expect(r.calculations.map((c) => c.id)).toEqual([counted.id]);
    expect(r.editions).toMatchObject([
      { edition: 1, gwp: { co2: '1', ch4: '28', n2o: '265' }, calculationCount: 1 },
    ]);
    expect(r.gwpConsistent).toBe(true);

    // The drill-down carries the same figures, with day coverage.
    const source = r.facilities[0]?.assets[0]?.flareSources[0];
    expect(source).toMatchObject({ code: 'S-1' });
    expect(source?.total?.co2eTonnes).toBe(counted.results.co2eTonnes);
    expect(source?.dayCoverage).toEqual([
      { activityType: 'ROUTINE_FLARING', daysCovered: 3, daysElapsed: 31 },
    ]);
  });

  it('leaves out a record crossing the month boundary, and counts it in the quarter', async () => {
    const record = await approvedRecord('2026-01-25', {
      kind: 'PERIOD',
      periodEnd: '2026-02-05',
      totalVolume: { value: '30', unit: 'MMSCF' },
    });
    const calc = await calculation(record);

    const jan = await report('2026-01');
    expect(jan.summary.byType).toEqual([]);
    expect(jan.summary.total).toBeNull();
    expect(jan.unplaced).toMatchObject([
      { activityRecordId: record, periodStart: '2026-01-25', co2eTonnes: calc.results.co2eTonnes },
    ]);
    expect((await report('2026-02')).unplaced).toHaveLength(1);

    const q1 = await report('2026-Q1');
    expect(q1.unplaced).toEqual([]);
    expect(routine(q1)?.emissions?.co2eTonnes).toBe(calc.results.co2eTonnes);
    expect((await report('2026')).summary.total?.co2eTonnes).toBe(calc.results.co2eTonnes);
  });

  it('keeps an approved record counting while its revision is open, then drops it', async () => {
    const record = await approvedRecord('2026-01-10');
    const calc = await calculation(record);
    const revision = await post(w.entry, `${base(w.org)}/activity-records/${record}/revise`);
    const revisionId = revision.body.data.id as string;

    const open = await report('2026-01');
    expect(routine(open)?.emissions?.co2eTonnes).toBe(calc.results.co2eTonnes);
    expect(routine(open)?.coverage).toMatchObject({ openRevisions: 1, recordsNotYetApproved: 0 });

    await approve(revisionId);
    const after = await report('2026-01');
    expect(routine(after)?.emissions).toBeNull();
    expect(routine(after)?.coverage).toMatchObject({
      approvedRecords: 1,
      approvedRecordsAwaitingCalculation: 1,
    });
    expect(after.calculations).toEqual([]);
  });

  it('keeps activity types apart, totals tCO2e exactly, and marks N2O not applicable for venting', async () => {
    await post(w.entry, `${base(w.org)}/flare-sources/${w.source}/gas-compositions`, {
      validFrom: '2026-01-01',
      sampleDate: '2026-01-01',
      sampleReference: 'LAB-1',
      components: {
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
      },
    });
    const flaring = await calculation(await approvedRecord('2026-02-01'));
    const venting = await calculation(
      await approvedRecord('2026-02-02', {
        activityType: 'VENTING',
        totalVolume: { value: '0.5', unit: 'MMSCF' },
      }),
      true,
      { route: 'COMPOSITION_VENTING' },
    );

    const r = await report('2026-02');
    expect(r.summary.byType.map((t) => t.activityType)).toEqual(['ROUTINE_FLARING', 'VENTING']);
    const vent = r.summary.byType.find((t) => t.activityType === 'VENTING');
    expect(vent?.emissions?.n2oTonnes).toBeNull();
    expect(vent?.emissions?.measuredBasisCo2eTonnes).toBe(venting.results.co2eTonnes);
    expect(vent?.approvedVolumeMmscf).toBe('0.5');
    expect(r.summary.total).toMatchObject({
      calculationCount: 2,
      co2eTonnes: new D(flaring.results.co2eTonnes).plus(venting.results.co2eTonnes).toFixed(),
      n2oTonnes: flaring.results.n2oTonnes,
      estimatedCo2eTonnes: flaring.results.co2eTonnes,
      measuredBasisCo2eTonnes: venting.results.co2eTonnes,
      volumeCalculatedMmscf: '20.5',
    });

    const filtered = await report('2026-02', '&activityType=VENTING');
    expect(filtered.summary.byType.map((t) => t.activityType)).toEqual(['VENTING']);
    expect(filtered.summary.total?.co2eTonnes).toBe(venting.results.co2eTonnes);
  });

  it('gives a 12-month trend of approved tCO2e', async () => {
    const calc = await calculation(await approvedRecord('2026-03-05'));
    const res = await w.viewer.agent.get(`${base(w.org)}/reports/emissions/trend?endMonth=2026-06`);
    expect(res.status).toBe(200);
    const trend = res.body.data as EmissionsTrendDto;
    expect(trend.months.map((m) => m.key)).toEqual([
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    const march = trend.months.find((m) => m.key === '2026-03');
    expect(march).toMatchObject({ total: calc.results.co2eTonnes, includesEstimated: true });
    expect(march?.byType.ROUTINE_FLARING).toBe(calc.results.co2eTonnes);
    expect(march?.byType.VENTING).toBeNull();
    expect(trend.months.find((m) => m.key === '2026-04')?.total).toBeNull();
  });
});

describe('access to reports', () => {
  it('lets every role read reports and rejects malformed periods', async () => {
    for (const user of [w.owner, w.entry, w.reviewer, w.approver, w.viewer]) {
      expect((await user.agent.get(`${base(w.org)}/reports/emissions?period=2026`)).status).toBe(
        200,
      );
    }
    for (const period of ['2026-13', '2026-Q5', '1999', '26', '2026-1']) {
      const res = await w.viewer.agent.get(`${base(w.org)}/reports/emissions?period=${period}`);
      expect(res.status, period).toBe(400);
    }
    expect((await w.viewer.agent.get(`${base(w.org)}/reports/emissions`)).status).toBe(400);
  });

  it('keeps each organisation’s figures to itself', async () => {
    await calculation(await approvedRecord('2026-01-10'));
    // Another organisation's member can't read this one's reports...
    expect(
      (await w.ownerB.agent.get(`${base(w.org)}/reports/emissions?period=2026-01`)).status,
    ).toBe(404);
    // ...sees none of its figures in their own...
    const own = await w.ownerB.agent.get(`${base(w.orgB)}/reports/emissions?period=2026-01`);
    expect(own.status).toBe(200);
    expect(own.body.data.summary.total).toBeNull();
    expect(own.body.data.calculations).toEqual([]);
    // ...and can't filter by its facility.
    const foreign = await w.ownerB.agent.get(
      `${base(w.orgB)}/reports/emissions?period=2026-01&facilityId=${w.facility}`,
    );
    expect(foreign.status).toBe(404);
    expect(
      (
        await w.ownerB.agent.get(
          `${base(w.orgB)}/reports/emissions.csv?period=2026-01&facilityId=${w.facility}`,
        )
      ).status,
    ).toBe(404);
  });

  it('exports a CSV with the basis, full precision and the calculations used, and audits it', async () => {
    const calc = await calculation(await approvedRecord('2026-01-10'));
    const res = await w.viewer.agent.get(
      `${base(w.org)}/reports/emissions.csv?period=2026-Q1&facilityId=${w.facility}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="flame-emissions-2026-Q1.csv"',
    );
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('Approved calculations only. Not carbon credits.');
    expect(text).toContain('F-1 Bonny');
    expect(text).toContain(calc.id);
    expect(text).toContain(calc.results.co2eTonnes);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'report.exported' } });
    expect(audit).toMatchObject({ organisationId: w.org, entityType: 'emissions_report' });
    expect(audit?.metadata).toMatchObject({ period: '2026-Q1', calculationCount: 1 });
  });
});
