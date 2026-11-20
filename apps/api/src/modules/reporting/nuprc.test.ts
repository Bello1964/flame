import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import {
  NUPRC_APPENDIX_C_COLUMNS,
  type CalculationDto,
  type IssuedReportDto,
  type NuprcMonthlyLogDto,
  type NuprcQuarterlyReportDto,
} from '@flame/shared';
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
function patch(user: LoggedIn, path: string, body: object) {
  return user.agent.patch(path).set(CSRF_HEADER, user.csrfToken).send(body);
}

async function member(email: string, orgId: string, roles: Role[]) {
  const user = await createUser(email);
  await addMember(user.id, orgId, roles);
  return login(app, email);
}

interface World {
  org: string;
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
}

async function approvedRecord(start: string, overrides: Record<string, unknown> = {}) {
  const res = await post(w.entry, `${base(w.org)}/activity-records`, {
    flareSourceId: w.source,
    kind: 'DAILY',
    periodStart: start,
    activityType: 'ROUTINE_FLARING',
    totalVolume: { value: '20', unit: 'MMSCF' },
    operatingHours: '12',
    referenceTemperature: { value: '15', unit: 'CELSIUS' },
    referencePressure: { value: '101.325', unit: 'KPA_ABS' },
    measurementBasis: 'MEASURED',
    measurementMethod: 'METERED',
    ...overrides,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const id = res.body.data.id as string;
  const path = `${base(w.org)}/activity-records/${id}`;
  await act(w.entry, path, 'submit');
  await act(w.reviewer, path, 'start-review');
  await act(w.reviewer, path, 'forward');
  await act(w.approver, path, 'approve');
  return id;
}

async function approvedCalculation(recordId: string) {
  const res = await post(w.entry, `${base(w.org)}/activity-records/${recordId}/calculations`, {
    route: 'IPCC_REFERENCE_FLARING',
    fallbackReason: 'No analysis yet',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const calc = res.body.data as CalculationDto;
  const path = `${base(w.org)}/calculations/${calc.id}`;
  await act(w.entry, path, 'submit');
  await act(w.reviewer, path, 'start-review');
  await act(w.reviewer, path, 'forward');
  await act(w.approver, path, 'approve');
  return calc;
}

async function quarterly(period = '2026-Q3', user: LoggedIn = w.viewer) {
  const res = await user.agent.get(`${base(w.org)}/reports/nuprc/quarterly?period=${period}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as NuprcQuarterlyReportDto;
}

beforeEach(async () => {
  await resetDatabase();
  const [a, b] = await Promise.all([createOrganisation('org-a'), createOrganisation('org-b')]);
  const owner = await member('owner@example.com', a.id, ['ORGANISATION_OWNER']);
  const f = await post(owner, `${base(a.id)}/facilities`, {
    name: 'Bonny',
    code: 'F-1',
    terrain: 'ONSHORE',
    facilityType: 'FLOWSTATION',
    latitude: '4.4500',
    longitude: '7.1700',
  });
  expect(f.status, JSON.stringify(f.body)).toBe(201);
  const asset = await post(owner, `${base(a.id)}/assets`, {
    facilityId: f.body.data.id,
    name: 'Flow station',
    code: 'A-1',
  });
  const s = await post(owner, `${base(a.id)}/flare-sources`, {
    assetId: asset.body.data.id,
    name: 'HP Flare',
    code: 'S-1',
    flareType: 'ELEVATED',
  });
  w = {
    org: a.id,
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

describe('NUPRC fields', () => {
  it('stores the optional facility, record and organisation fields', async () => {
    const f = await patch(w.owner, `${base(w.org)}/facilities/${w.facility}`, {
      concession: 'OML 58',
      fieldName: 'Obagi',
      segment: 'OIL_AND_GAS',
    });
    expect(f.status, JSON.stringify(f.body)).toBe(200);
    expect(f.body.data).toMatchObject({
      terrain: 'ONSHORE',
      concession: 'OML 58',
      fieldName: 'Obagi',
      facilityType: 'FLOWSTATION',
      segment: 'OIL_AND_GAS',
    });
    const s = await patch(w.owner, `${base(w.org)}/settings`, { abbreviation: 'BNY' });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.data.abbreviation).toBe('BNY');

    const bad = await post(w.entry, `${base(w.org)}/activity-records`, {
      flareSourceId: w.source,
      kind: 'DAILY',
      periodStart: '2026-07-01',
      activityType: 'ROUTINE_FLARING',
      totalVolume: { value: '1', unit: 'MMSCF' },
      referenceTemperature: { value: '15', unit: 'CELSIUS' },
      referencePressure: { value: '101.325', unit: 'KPA_ABS' },
      measurementBasis: 'MEASURED',
      measurementMethod: 'METERED',
      startTime: '25:00',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fieldErrors).toHaveProperty('startTime');
  });
});

describe('NUPRC quarterly GHG inventory', () => {
  it('builds Appendix C from approved calculations only, by month', async () => {
    const july = await approvedRecord('2026-07-10');
    const calcJuly = await approvedCalculation(july);
    const august = await approvedRecord('2026-08-05');
    const calcAugust = await approvedCalculation(august);
    await approvedRecord('2026-08-06'); // approved, no calculation yet
    await approvedRecord('2026-09-30', { kind: 'PERIOD', periodEnd: '2026-10-02' }); // crosses the quarter

    const r = await quarterly();
    expect(r.organisation.name).toBe('Test org-a');
    expect(r.appendixC.map((row) => row.month)).toEqual(['July', 'August']);
    const row = r.appendixC[0]!;
    expect(row).toMatchObject({
      serial: 1,
      year: '2026',
      facilityName: 'Bonny',
      terrain: 'Onshore',
      facilityType: 'Flowstation',
      coordinates: '4.45, 7.17',
      emissionSource: 'Flaring',
      equipmentType: 'Flare Point (Elevated)',
      unit: 'Tonnes CO2e',
      total: calcJuly.results.co2eTonnes,
      framework: null,
    });
    expect(row.comments).toContain('IPCC tier not set in methodology edition 1');
    expect(row.comments).toContain('company abbreviation');
    expect(row.comments).toContain('concession');
    // Gas columns reconcile with the approved total to rounding.
    const parts = new D(row.co2).plus(row.ch4).plus(row.n2o ?? '0');
    expect(parts.minus(row.total).abs().lt('0.001')).toBe(true);
    expect(r.appendixC[1]!.total).toBe(calcAugust.results.co2eTonnes);

    expect(r.coverage).toEqual({
      approvedRecords: 3,
      withoutApprovedCalculation: 1,
      awaitingApproval: 0,
    });
    expect(r.unplaced).toHaveLength(1);
    expect(r.gasTotals).toHaveLength(1);
    expect(r.gasTotals[0]!.calculationCount).toBe(2);
    expect(r.activityTotals[0]).toMatchObject({
      activityType: 'ROUTINE_FLARING',
      approvedVolumeMmscf: '60',
      volumeCalculatedMmscf: '40',
      recordCount: 3,
    });
    expect(r.appendixA[0]).toMatchObject({
      sourceCategory: 'Flaring',
      quantity: 1,
      pollutants: 'CO2, CH4, N2O',
      uncertainty: 'Not quantified in Flame',
    });
    expect(r.notRecorded.join(' ')).toContain('Combustion');
    expect(r.editions).toHaveLength(1);
  });

  it('downloads Appendix C with NUPRC’s exact header, and audits the download', async () => {
    await approvedCalculation(await approvedRecord('2026-07-10'));
    const res = await w.viewer.agent.get(
      `${base(w.org)}/reports/nuprc/quarterly.csv?period=2026-Q3`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const bom = String.fromCharCode(0xfeff);
    const text = res.text.startsWith(bom) ? res.text.slice(1) : res.text;
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe(
      NUPRC_APPENDIX_C_COLUMNS.map((c) => (c.includes(',') ? `"${c}"` : c)).join(','),
    );
    expect(lines).toHaveLength(2);
    expect(
      await prisma.auditLog.count({ where: { action: 'report.exported', organisationId: w.org } }),
    ).toBe(1);
  });

  it('is only for members of the organisation', async () => {
    const res = await w.ownerB.agent.get(`${base(w.org)}/reports/nuprc/quarterly?period=2026-Q3`);
    expect(res.status).toBe(404);
    const bad = await w.viewer.agent.get(`${base(w.org)}/reports/nuprc/quarterly?period=2026-07`);
    expect(bad.status).toBe(400);
  });
});

describe('NUPRC monthly flare and vent log', () => {
  it('lists regulation 20(4) items with monthly totals', async () => {
    await approvedRecord('2026-07-10', { startTime: '06:30', gasSource: 'sour inlet gas' });
    await approvedRecord('2026-07-11');
    await approvedRecord('2026-07-12', { activityType: 'VENTING' });
    const res = await w.viewer.agent.get(`${base(w.org)}/reports/nuprc/monthly?period=2026-07`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const log = res.body.data as NuprcMonthlyLogDto;
    expect(log.entries).toHaveLength(3);
    expect(log.entries[0]).toMatchObject({
      emissionSource: 'Flaring',
      startTime: '06:30',
      gasSource: 'sour inlet gas',
      durationHours: '12',
      volumeMmscf: '20',
      originalVolume: { value: '20', unit: 'MMSCF' },
      measurementBasis: 'MEASURED',
      ch4Co2e: null,
    });
    expect(log.totals).toEqual({ flaredMmscf: '40', ventedMmscf: '20' });
    expect(log.sourceTotals).toEqual([
      expect.objectContaining({ flareSourceCode: 'S-1', flaredMmscf: '40', ventedMmscf: '20' }),
    ]);
    expect(log.notes.join(' ')).toContain('no start time');
    expect(log.notRecorded.join(' ')).toContain('regulation 21');

    const csv = await w.viewer.agent.get(
      `${base(w.org)}/reports/nuprc/monthly.csv?period=2026-07&part=totals`,
    );
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('All sources,,,40,20');
  });
});

describe('issued NUPRC reports', () => {
  const issuedPath = () => `${base(w.org)}/reports/issued`;

  async function issue(user: LoggedIn, body: object) {
    return post(user, issuedPath(), {
      kind: 'QUARTERLY_GHG_INVENTORY',
      period: '2026-Q3',
      ...body,
    });
  }

  it('freezes a snapshot that a different person approves, and never changes it', async () => {
    await approvedCalculation(await approvedRecord('2026-07-10'));
    const issued = await issue(w.approver, {});
    expect(issued.status, JSON.stringify(issued.body)).toBe(201);
    const v1 = issued.body.data as IssuedReportDto;
    expect(v1).toMatchObject({
      version: 1,
      status: 'AWAITING_APPROVAL',
      issuedBy: { name: 'approver' },
    });

    // Separation of duties, and only report:issue holders.
    const self = await post(w.approver, `${issuedPath()}/${v1.id}/approve`);
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('SEPARATION_OF_DUTIES');
    expect((await post(w.viewer, `${issuedPath()}/${v1.id}/approve`)).status).toBe(403);
    expect((await issue(w.viewer, {})).status).toBe(403);
    // One awaiting approval at a time.
    expect((await issue(w.owner, { reason: 'again' })).status).toBe(409);

    const approved = await post(w.owner, `${issuedPath()}/${v1.id}/approve`);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');

    // New approved data after issuing doesn't touch the snapshot.
    await approvedCalculation(await approvedRecord('2026-08-05'));
    const again = await w.viewer.agent.get(`${issuedPath()}/${v1.id}`);
    expect((again.body.data as IssuedReportDto).snapshot.kind).toBe('QUARTERLY_GHG_INVENTORY');
    const snap = again.body.data.snapshot as NuprcQuarterlyReportDto;
    expect(snap.appendixC).toHaveLength(1);
    expect((await quarterly()).appendixC).toHaveLength(2);

    // The database refuses to change what was issued.
    await expect(
      prisma.issuedReport.update({ where: { id: v1.id }, data: { snapshot: {} } }),
    ).rejects.toThrow(/cannot change/);

    // A correction is a new version with a reason; approving it supersedes version 1.
    const noReason = await issue(w.approver, {});
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.code).toBe('ISSUED_REPORT_REASON_REQUIRED');
    const v2 = (await issue(w.approver, { reason: 'August added' })).body.data as IssuedReportDto;
    expect(v2.version).toBe(2);
    await post(w.owner, `${issuedPath()}/${v2.id}/approve`);
    const list = await w.viewer.agent.get(`${issuedPath()}?kind=QUARTERLY_GHG_INVENTORY`);
    expect(list.body.data.map((r: IssuedReportDto) => [r.version, r.status])).toEqual([
      [2, 'APPROVED'],
      [1, 'SUPERSEDED'],
    ]);

    // CSV from the snapshot.
    const csv = await w.viewer.agent.get(`${issuedPath()}/${v1.id}/csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-disposition']).toContain('v1-SUPERSEDED-appendix-c');
    expect(csv.text.trim().split('\r\n')).toHaveLength(2);
  });

  it('rejects with a comment, and records the submission once', async () => {
    const v1 = (await issue(w.approver, {})).body.data as IssuedReportDto;
    const noComment = await post(w.owner, `${issuedPath()}/${v1.id}/reject`, {});
    expect(noComment.status).toBe(400);
    const rejected = await post(w.owner, `${issuedPath()}/${v1.id}/reject`, {
      comment: 'Wait for August',
    });
    expect(rejected.body.data).toMatchObject({
      status: 'REJECTED',
      rejectionComment: 'Wait for August',
    });
    expect(
      (await post(w.owner, `${issuedPath()}/${v1.id}/submission`, { submittedOn: '2026-11-01' }))
        .status,
    ).toBe(409);

    const v2 = (await issue(w.approver, { reason: 'Reissued' })).body.data as IssuedReportDto;
    await post(w.owner, `${issuedPath()}/${v2.id}/approve`);
    const future = await post(w.owner, `${issuedPath()}/${v2.id}/submission`, {
      submittedOn: '2999-01-01',
    });
    expect(future.status).toBe(400);
    const today = new Date().toISOString().slice(0, 10);
    const ok = await post(w.approver, `${issuedPath()}/${v2.id}/submission`, {
      submittedOn: today,
      reference: 'NUPRC/GHG/2026/Q3/001',
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data).toMatchObject({
      submittedOn: today,
      submissionReference: 'NUPRC/GHG/2026/Q3/001',
    });
    expect(
      (await post(w.owner, `${issuedPath()}/${v2.id}/submission`, { submittedOn: today })).status,
    ).toBe(409);
    expect(
      await prisma.auditLog.count({
        where: {
          action: {
            in: [
              'report.issued',
              'report.rejected',
              'report.approved',
              'report.submission_recorded',
            ],
          },
        },
      }),
    ).toBe(5);
  });

  it('refuses a period that has not ended, and hides other organisations’ reports', async () => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const open = await post(w.approver, issuedPath(), {
      kind: 'MONTHLY_FLARE_VENT_LOG',
      period: thisMonth,
    });
    expect(open.status).toBe(400);
    const wrongKind = await post(w.approver, issuedPath(), {
      kind: 'MONTHLY_FLARE_VENT_LOG',
      period: '2026-Q3',
    });
    expect(wrongKind.status).toBe(400);

    const v1 = (await issue(w.approver, {})).body.data as IssuedReportDto;
    expect((await w.ownerB.agent.get(`${issuedPath()}/${v1.id}`)).status).toBe(404);
  });
});

describe('records that cross a month boundary', () => {
  it('get their own Appendix C row, named by the months they span', async () => {
    const span = await approvedRecord('2026-07-25', { kind: 'PERIOD', periodEnd: '2026-08-05' });
    const calc = await approvedCalculation(span);
    await approvedCalculation(await approvedRecord('2026-07-10'));

    const r = await quarterly();
    expect(r.appendixC.map((row) => row.month)).toEqual(['July', 'July–August']);
    const spanning = r.appendixC[1]!;
    expect(spanning.total).toBe(calc.results.co2eTonnes);
    expect(spanning.comments).toContain('spanning these months, not split');
    // Appendix C now adds up to the quarter's totals by gas.
    const sumC = r.appendixC.reduce((acc, row) => acc.plus(row.total), new D(0));
    expect(sumC.toFixed()).toBe(r.gasTotals[0]!.total);
  });

  it('are listed in both months of the monthly log, flagged and kept out of the totals', async () => {
    await approvedRecord('2026-07-31', { kind: 'PERIOD', periodEnd: '2026-08-01' });
    await approvedRecord('2026-07-10');
    for (const month of ['2026-07', '2026-08']) {
      const res = await w.viewer.agent.get(`${base(w.org)}/reports/nuprc/monthly?period=${month}`);
      const log = res.body.data as NuprcMonthlyLogDto;
      const flagged = log.entries.filter((e) => e.spansMonths);
      expect(flagged, month).toHaveLength(1);
      expect(flagged[0]!.volumeMmscf).toBe('20');
    }
    const july = (await w.viewer.agent.get(`${base(w.org)}/reports/nuprc/monthly?period=2026-07`))
      .body.data as NuprcMonthlyLogDto;
    expect(july.totals.flaredMmscf).toBe('20');
    expect(july.notes.join(' ')).toContain('cross a month boundary');
  });
});

describe('issued report safeguards', () => {
  const issuedPath = () => `${base(w.org)}/reports/issued`;

  it('names the status in CSVs of unapproved versions and refuses the issuer’s rejection', async () => {
    const v1 = (
      await post(w.approver, issuedPath(), { kind: 'QUARTERLY_GHG_INVENTORY', period: '2026-Q3' })
    ).body.data as IssuedReportDto;
    const csv = await w.viewer.agent.get(`${issuedPath()}/${v1.id}/csv`);
    expect(csv.headers['content-disposition']).toContain('v1-AWAITING-APPROVAL-appendix-c');
    const self = await post(w.approver, `${issuedPath()}/${v1.id}/reject`, { comment: 'mine' });
    expect(self.status).toBe(403);
    const wrongPart = await w.viewer.agent.get(`${issuedPath()}/${v1.id}/csv?part=entries`);
    expect(wrongPart.status).toBe(400);
  });

  it('lets the database refuse backward moves and rewriting a recorded submission', async () => {
    const v1 = (
      await post(w.approver, issuedPath(), { kind: 'QUARTERLY_GHG_INVENTORY', period: '2026-Q3' })
    ).body.data as IssuedReportDto;
    await post(w.owner, `${issuedPath()}/${v1.id}/approve`);
    const today = new Date().toISOString().slice(0, 10);
    await post(w.owner, `${issuedPath()}/${v1.id}/submission`, { submittedOn: today });
    await expect(
      prisma.issuedReport.update({ where: { id: v1.id }, data: { status: 'AWAITING_APPROVAL' } }),
    ).rejects.toThrow(/cannot move/);
    const other = await prisma.user.findFirstOrThrow({ where: { email: 'viewer@example.com' } });
    await expect(
      prisma.issuedReport.update({
        where: { id: v1.id },
        data: { submissionRecordedById: other.id },
      }),
    ).rejects.toThrow(/submission cannot change/);
  });
});
