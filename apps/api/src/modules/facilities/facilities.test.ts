import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
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

interface World {
  orgA: { id: string };
  orgB: { id: string };
  ownerA: LoggedIn;
  viewerA: LoggedIn;
  ownerB: LoggedIn;
}

let w: World;

const base = (orgId: string) => `/api/v1/organisations/${orgId}`;

function post(user: LoggedIn, path: string, body: object) {
  return user.agent.post(path).set(CSRF_HEADER, user.csrfToken).send(body);
}
function patch(user: LoggedIn, path: string, body: object) {
  return user.agent.patch(path).set(CSRF_HEADER, user.csrfToken).send(body);
}

async function createFacility(user: LoggedIn, orgId: string, code = 'FAC-1') {
  const res = await post(user, `${base(orgId)}/facilities`, { name: `Facility ${code}`, code });
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

async function createAsset(user: LoggedIn, orgId: string, facilityId: string, code = 'AST-1') {
  const res = await post(user, `${base(orgId)}/assets`, {
    facilityId,
    name: `Asset ${code}`,
    code,
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

/** Creates a user with the given roles in an organisation and signs them in. */
async function memberWithRoles(email: string, orgId: string, roles: Role[]): Promise<LoggedIn> {
  const user = await createUser(email);
  await addMember(user.id, orgId, roles);
  return login(app, email);
}

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
  w = {
    orgA,
    orgB,
    ownerA: await login(app, 'owner-a@example.com'),
    viewerA: await login(app, 'viewer-a@example.com'),
    ownerB: await login(app, 'owner-b@example.com'),
  };
});

describe('organisation access', () => {
  it('requires authentication', async () => {
    const res = await request(app).get(`${base(w.orgA.id)}/facilities`);
    expect(res.status).toBe(401);
  });

  it('returns 404 to non-members, revealing nothing about the organisation', async () => {
    const res = await w.ownerB.agent.get(`${base(w.orgA.id)}/facilities`);
    expect(res.status).toBe(404);
    const missing = await w.ownerB.agent.get(
      `${base('0199a3b2-0000-7000-8000-000000000000')}/facilities`,
    );
    expect(res.body).toEqual(missing.body);
  });

  it('returns 404 for a malformed organisation id', async () => {
    const res = await w.ownerA.agent.get(`${base('not-a-uuid')}/facilities`);
    expect(res.status).toBe(404);
  });

  it('denies access through a suspended membership', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'viewer-a@example.com' } });
    await prisma.membership.update({
      where: { userId_organisationId: { userId: user.id, organisationId: w.orgA.id } },
      data: { status: 'SUSPENDED' },
    });
    const res = await w.viewerA.agent.get(`${base(w.orgA.id)}/facilities`);
    expect(res.status).toBe(404);
  });

  it('denies access to every member of a suspended organisation', async () => {
    await createFacility(w.ownerA, w.orgA.id);
    await prisma.organisation.update({ where: { id: w.orgA.id }, data: { status: 'SUSPENDED' } });

    const list = await w.ownerA.agent.get(`${base(w.orgA.id)}/facilities`);
    expect(list.status).toBe(404);
    const write = await post(w.ownerA, `${base(w.orgA.id)}/facilities`, { name: 'X', code: 'X' });
    expect(write.status).toBe(404);

    // The suspended organisation also disappears from the session's membership list.
    const session = await w.ownerA.agent.get('/api/v1/auth/session');
    expect(session.body.data.memberships).toEqual([]);
  });

  it('gives a platform administrator no implicit tenant access', async () => {
    await createUser('platform@example.com', { isPlatformAdmin: true });
    const admin = await login(app, 'platform@example.com');
    const res = await admin.agent.get(`${base(w.orgA.id)}/facilities`);
    expect(res.status).toBe(404);
  });

  it('GET /organisations/:id returns the organisation with the caller’s roles', async () => {
    const res = await w.viewerA.agent.get(base(w.orgA.id));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: w.orgA.id, slug: 'org-a', roles: ['VIEWER'] });
  });
});

describe('role permissions', () => {
  it('lets a viewer read but not write', async () => {
    await createFacility(w.ownerA, w.orgA.id);
    const list = await w.viewerA.agent.get(`${base(w.orgA.id)}/facilities`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const create = await post(w.viewerA, `${base(w.orgA.id)}/facilities`, { name: 'X', code: 'X' });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('FORBIDDEN');
  });

  it('lets an administrator write', async () => {
    const admin = await memberWithRoles('admin-a@example.com', w.orgA.id, ['ADMINISTRATOR']);
    const res = await post(admin, `${base(w.orgA.id)}/facilities`, { name: 'X', code: 'X' });
    expect(res.status).toBe(201);
  });

  it.each<Role>(['APPROVER', 'REVIEWER', 'DATA_ENTRY_OFFICER'])(
    'lets %s read but denies hierarchy writes',
    async (role) => {
      const facility = await createFacility(w.ownerA, w.orgA.id);
      const asset = await createAsset(w.ownerA, w.orgA.id, facility.id);
      const user = await memberWithRoles(`${role.toLowerCase()}@example.com`, w.orgA.id, [role]);

      expect((await user.agent.get(`${base(w.orgA.id)}/facilities`)).status).toBe(200);

      const attempts = [
        post(user, `${base(w.orgA.id)}/facilities`, { name: 'X', code: 'X' }),
        patch(user, `${base(w.orgA.id)}/facilities/${facility.id}`, { name: 'Renamed' }),
        post(user, `${base(w.orgA.id)}/assets/${asset.id}/archive`, {}),
        post(user, `${base(w.orgA.id)}/flare-sources`, {
          assetId: asset.id,
          name: 'X',
          code: 'X',
        }),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
      expect(await prisma.facility.count()).toBe(1);
      expect(await prisma.flareSource.count()).toBe(0);
    },
  );

  it('grants the union of permissions to a member with several roles', async () => {
    const user = await memberWithRoles('multi@example.com', w.orgA.id, ['VIEWER', 'ADMINISTRATOR']);
    const res = await post(user, `${base(w.orgA.id)}/facilities`, { name: 'X', code: 'X' });
    expect(res.status).toBe(201);
  });

  it('requires the CSRF token for writes', async () => {
    const res = await w.ownerA.agent
      .post(`${base(w.orgA.id)}/facilities`)
      .send({ name: 'X', code: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });

  it('rejects an authenticated write from a foreign Origin even with a valid CSRF token', async () => {
    const res = await w.ownerA.agent
      .post(`${base(w.orgA.id)}/facilities`)
      .set(CSRF_HEADER, w.ownerA.csrfToken)
      .set('Origin', 'https://evil.example')
      .send({ name: 'X', code: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
    expect(await prisma.facility.count()).toBe(0);
  });
});

describe('facilities', () => {
  it('creates a facility scoped to the caller’s organisation, preserving exact coordinates', async () => {
    const res = await post(w.ownerA, `${base(w.orgA.id)}/facilities`, {
      name: 'Bonny Terminal',
      code: 'BNY-01',
      region: 'Rivers',
      latitude: '4.453210',
      longitude: 7.164321,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      organisationId: w.orgA.id,
      name: 'Bonny Terminal',
      code: 'BNY-01',
      country: 'NG',
      latitude: '4.45321',
      longitude: '7.164321',
      status: 'ACTIVE',
    });

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'facility.created' } });
    expect(audit.organisationId).toBe(w.orgA.id);
    expect(audit.entityId).toBe(res.body.data.id);
  });

  it('ignores no client-supplied organisationId: unknown body fields are rejected', async () => {
    const res = await post(w.ownerA, `${base(w.orgA.id)}/facilities`, {
      name: 'Sneaky',
      code: 'SNK',
      organisationId: w.orgB.id,
    });
    expect(res.status).toBe(400);
    expect(await prisma.facility.count()).toBe(0);
  });

  it('validates coordinates and pagination', async () => {
    const badLat = await post(w.ownerA, `${base(w.orgA.id)}/facilities`, {
      name: 'X',
      code: 'X',
      latitude: 91,
    });
    const tooPrecise = await post(w.ownerA, `${base(w.orgA.id)}/facilities`, {
      name: 'X',
      code: 'X',
      latitude: '4.1234567',
    });
    const bigPage = await w.ownerA.agent.get(`${base(w.orgA.id)}/facilities?pageSize=1000`);
    expect(badLat.status).toBe(400);
    expect(tooPrecise.status).toBe(400);
    expect(bigPage.status).toBe(400);
  });

  it('enforces unique codes per organisation but allows the same code in another', async () => {
    await createFacility(w.ownerA, w.orgA.id, 'DUP');
    const dupe = await post(w.ownerA, `${base(w.orgA.id)}/facilities`, { name: 'Y', code: 'DUP' });
    expect(dupe.status).toBe(409);
    await createFacility(w.ownerB, w.orgB.id, 'DUP');
  });

  it('returns 409 when an update would duplicate another record’s code, leaving it unchanged', async () => {
    await createFacility(w.ownerA, w.orgA.id, 'TAKEN');
    const other = await createFacility(w.ownerA, w.orgA.id, 'MINE');

    const res = await patch(w.ownerA, `${base(w.orgA.id)}/facilities/${other.id}`, {
      code: 'TAKEN',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    const unchanged = await prisma.facility.findUniqueOrThrow({ where: { id: other.id } });
    expect(unchanged.code).toBe('MINE');
    expect(await prisma.auditLog.count({ where: { action: 'facility.updated' } })).toBe(0);
  });

  it('lists only the caller’s organisation’s facilities, with paging and search', async () => {
    await createFacility(w.ownerA, w.orgA.id, 'A-1');
    await createFacility(w.ownerA, w.orgA.id, 'A-2');
    await createFacility(w.ownerB, w.orgB.id, 'B-1');

    const res = await w.ownerA.agent.get(`${base(w.orgA.id)}/facilities?pageSize=1`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
    expect(res.body.data).toHaveLength(1);

    const search = await w.ownerA.agent.get(`${base(w.orgA.id)}/facilities?q=a-2`);
    expect(search.body.data.map((f: { code: string }) => f.code)).toEqual(['A-2']);
  });
});

describe('cross-tenant isolation', () => {
  it('hides another organisation’s records behind 404 on read, update and archive', async () => {
    const facility = await createFacility(w.ownerA, w.orgA.id);
    const asset = await createAsset(w.ownerA, w.orgA.id, facility.id);
    const source = await post(w.ownerA, `${base(w.orgA.id)}/flare-sources`, {
      assetId: asset.id,
      name: 'Flare FL-1',
      code: 'FL-1',
    });
    expect(source.status).toBe(201);
    const sourceId = source.body.data.id as string;

    // Owner of B addresses A's records through B's organisation scope.
    const paths = [`facilities/${facility.id}`, `assets/${asset.id}`, `flare-sources/${sourceId}`];
    for (const p of paths) {
      expect((await w.ownerB.agent.get(`${base(w.orgB.id)}/${p}`)).status).toBe(404);
      expect((await patch(w.ownerB, `${base(w.orgB.id)}/${p}`, { name: 'pwned' })).status).toBe(
        404,
      );
      expect((await post(w.ownerB, `${base(w.orgB.id)}/${p}/archive`, {})).status).toBe(404);
    }

    const records = await Promise.all([
      prisma.facility.findUniqueOrThrow({ where: { id: facility.id } }),
      prisma.asset.findUniqueOrThrow({ where: { id: asset.id } }),
      prisma.flareSource.findUniqueOrThrow({ where: { id: sourceId } }),
    ]);
    expect(records.map((r) => [r.name, r.status])).toEqual([
      ['Facility FAC-1', 'ACTIVE'],
      ['Asset AST-1', 'ACTIVE'],
      ['Flare FL-1', 'ACTIVE'],
    ]);
  });

  it('keeps a member of two organisations inside the organisation named in the URL', async () => {
    const both = await createUser('both@example.com');
    await addMember(both.id, w.orgA.id, ['ORGANISATION_OWNER']);
    await addMember(both.id, w.orgB.id, ['ORGANISATION_OWNER']);
    const user = await login(app, 'both@example.com');
    expect(user.session.memberships).toHaveLength(2);

    const facilityA = await createFacility(user, w.orgA.id, 'IN-A');
    await createFacility(user, w.orgB.id, 'IN-B');

    // A's record is visible through A's URL…
    expect((await user.agent.get(`${base(w.orgA.id)}/facilities/${facilityA.id}`)).status).toBe(
      200,
    );
    // …but not through B's, even though the same user may write in B.
    const viaB = `${base(w.orgB.id)}/facilities/${facilityA.id}`;
    expect((await user.agent.get(viaB)).status).toBe(404);
    expect((await patch(user, viaB, { name: 'Moved' })).status).toBe(404);
    expect((await post(user, `${viaB}/archive`, {})).status).toBe(404);
    const childViaB = await post(user, `${base(w.orgB.id)}/assets`, {
      facilityId: facilityA.id,
      name: 'Cross',
      code: 'CROSS',
    });
    expect(childViaB.status).toBe(404);

    // Each organisation's list contains only its own records.
    const listA = await user.agent.get(`${base(w.orgA.id)}/facilities`);
    const listB = await user.agent.get(`${base(w.orgB.id)}/facilities`);
    expect(listA.body.data.map((f: { code: string }) => f.code)).toEqual(['IN-A']);
    expect(listB.body.data.map((f: { code: string }) => f.code)).toEqual(['IN-B']);

    const unchanged = await prisma.facility.findUniqueOrThrow({ where: { id: facilityA.id } });
    expect(unchanged.organisationId).toBe(w.orgA.id);
    expect(unchanged.name).toBe('Facility IN-A');
  });

  it('refuses to attach a child to another organisation’s parent', async () => {
    const facilityA = await createFacility(w.ownerA, w.orgA.id);
    const assetA = await createAsset(w.ownerA, w.orgA.id, facilityA.id);

    const asset = await post(w.ownerB, `${base(w.orgB.id)}/assets`, {
      facilityId: facilityA.id,
      name: 'Intruder',
      code: 'INT',
    });
    expect(asset.status).toBe(404);

    const source = await post(w.ownerB, `${base(w.orgB.id)}/flare-sources`, {
      assetId: assetA.id,
      name: 'Intruder',
      code: 'INT',
    });
    expect(source.status).toBe(404);
  });

  it('is also enforced by the database: composite foreign keys reject cross-tenant parents', async () => {
    const facilityA = await createFacility(w.ownerA, w.orgA.id);
    const ownerB = await prisma.user.findUniqueOrThrow({ where: { email: 'owner-b@example.com' } });
    await expect(
      prisma.asset.create({
        data: {
          organisationId: w.orgB.id,
          facilityId: facilityA.id,
          name: 'Bypass',
          code: 'BYP',
          createdById: ownerB.id,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('database guard against moving records between organisations', () => {
  async function buildTree() {
    const facility = await createFacility(w.ownerA, w.orgA.id);
    const asset = await createAsset(w.ownerA, w.orgA.id, facility.id);
    const source = await post(w.ownerA, `${base(w.orgA.id)}/flare-sources`, {
      assetId: asset.id,
      name: 'Flare',
      code: 'FL-1',
    });
    expect(source.status).toBe(201);
    return { facility, asset, sourceId: source.body.data.id as string };
  }

  async function expectTreeStillInOrgA(tree: Awaited<ReturnType<typeof buildTree>>) {
    const [facility, asset, source] = await Promise.all([
      prisma.facility.findUniqueOrThrow({ where: { id: tree.facility.id } }),
      prisma.asset.findUniqueOrThrow({ where: { id: tree.asset.id } }),
      prisma.flareSource.findUniqueOrThrow({ where: { id: tree.sourceId } }),
    ]);
    expect([facility, asset, source].map((r) => r.organisationId)).toEqual([
      w.orgA.id,
      w.orgA.id,
      w.orgA.id,
    ]);
  }

  it('rejects changing a facility’s organisation instead of cascading to its children', async () => {
    const tree = await buildTree();
    await expect(
      prisma.facility.update({
        where: { id: tree.facility.id },
        data: { organisationId: w.orgB.id },
      }),
    ).rejects.toThrow();
    await expectTreeStillInOrgA(tree);
  });

  it('rejects changing an asset’s organisation instead of cascading to its flare sources', async () => {
    const tree = await buildTree();
    await expect(
      prisma.asset.update({ where: { id: tree.asset.id }, data: { organisationId: w.orgB.id } }),
    ).rejects.toThrow();
    await expectTreeStillInOrgA(tree);
  });

  it('rejects changing an organisation’s id while records reference it', async () => {
    const tree = await buildTree();
    await expect(
      prisma.organisation.update({
        where: { id: w.orgA.id },
        data: { id: '0199a3b2-0000-7000-8000-0000000000aa' },
      }),
    ).rejects.toThrow();
    await expectTreeStillInOrgA(tree);
  });
});

describe('audit trail of edits', () => {
  async function lastAudit(action: string) {
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action },
      orderBy: { createdAt: 'desc' },
    });
    return entry.metadata;
  }

  it('records the previous and new value of each changed facility field', async () => {
    const facility = await createFacility(w.ownerA, w.orgA.id, 'BNY');
    const res = await patch(w.ownerA, `${base(w.orgA.id)}/facilities/${facility.id}`, {
      name: 'Bonny Terminal',
      latitude: '4.453210',
      region: null,
    });
    expect(res.status).toBe(200);

    expect(await lastAudit('facility.updated')).toEqual({
      changes: {
        name: { before: 'Facility BNY', after: 'Bonny Terminal' },
        latitude: { before: null, after: '4.45321' },
      },
    });
  });

  it('records previous values for asset and flare-source edits', async () => {
    const facility = await createFacility(w.ownerA, w.orgA.id);
    const asset = await createAsset(w.ownerA, w.orgA.id, facility.id);
    const source = await post(w.ownerA, `${base(w.orgA.id)}/flare-sources`, {
      assetId: asset.id,
      name: 'HP Flare',
      code: 'FL-HP',
    });

    await patch(w.ownerA, `${base(w.orgA.id)}/assets/${asset.id}`, { code: 'AST-9' });
    await patch(w.ownerA, `${base(w.orgA.id)}/flare-sources/${source.body.data.id as string}`, {
      flareType: 'GROUND',
    });

    expect(await lastAudit('asset.updated')).toEqual({
      changes: { code: { before: 'AST-1', after: 'AST-9' } },
    });
    expect(await lastAudit('flare_source.updated')).toEqual({
      changes: { flareType: { before: null, after: 'GROUND' } },
    });
  });

  it('writes no audit entry when an edit changes nothing', async () => {
    const facility = await createFacility(w.ownerA, w.orgA.id, 'SAME');
    const res = await patch(w.ownerA, `${base(w.orgA.id)}/facilities/${facility.id}`, {
      name: 'Facility SAME',
    });
    expect(res.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'facility.updated' } })).toBe(0);
  });
});

describe('hierarchy and archiving', () => {
  it('builds facility → asset → flare source and filters children by parent', async () => {
    const facility = await createFacility(w.ownerA, w.orgA.id);
    const asset1 = await createAsset(w.ownerA, w.orgA.id, facility.id, 'AST-1');
    const asset2 = await createAsset(w.ownerA, w.orgA.id, facility.id, 'AST-2');

    const src = await post(w.ownerA, `${base(w.orgA.id)}/flare-sources`, {
      assetId: asset1.id,
      name: 'HP Flare',
      code: 'FL-HP',
      flareType: 'ELEVATED',
    });
    expect(src.status).toBe(201);
    expect(src.body.data).toMatchObject({ assetId: asset1.id, flareType: 'ELEVATED' });

    const forAsset1 = await w.viewerA.agent.get(
      `${base(w.orgA.id)}/flare-sources?assetId=${asset1.id}`,
    );
    const forAsset2 = await w.viewerA.agent.get(
      `${base(w.orgA.id)}/flare-sources?assetId=${asset2.id}`,
    );
    expect(forAsset1.body.meta.total).toBe(1);
    expect(forAsset2.body.meta.total).toBe(0);
  });

  it('blocks archiving a parent with active children, then allows it bottom-up', async () => {
    const facility = await createFacility(w.ownerA, w.orgA.id);
    const asset = await createAsset(w.ownerA, w.orgA.id, facility.id);

    const blocked = await post(
      w.ownerA,
      `${base(w.orgA.id)}/facilities/${facility.id}/archive`,
      {},
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details).toEqual({ activeAssets: 1 });

    expect((await post(w.ownerA, `${base(w.orgA.id)}/assets/${asset.id}/archive`, {})).status).toBe(
      200,
    );
    const archived = await post(
      w.ownerA,
      `${base(w.orgA.id)}/facilities/${facility.id}/archive`,
      {},
    );
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe('ARCHIVED');
    expect(archived.body.data.archivedAt).toEqual(expect.any(String));
  });

  it('treats archived records as read-only and closed to new children', async () => {
    const facility = await createFacility(w.ownerA, w.orgA.id);
    await post(w.ownerA, `${base(w.orgA.id)}/facilities/${facility.id}/archive`, {});

    const edit = await patch(w.ownerA, `${base(w.orgA.id)}/facilities/${facility.id}`, {
      name: 'New',
    });
    expect(edit.status).toBe(409);

    const child = await post(w.ownerA, `${base(w.orgA.id)}/assets`, {
      facilityId: facility.id,
      name: 'Late',
      code: 'LATE',
    });
    expect(child.status).toBe(409);

    // Archived records stay retrievable for history.
    const read = await w.viewerA.agent.get(`${base(w.orgA.id)}/facilities/${facility.id}`);
    expect(read.status).toBe(200);
    const listed = await w.viewerA.agent.get(`${base(w.orgA.id)}/facilities?status=ARCHIVED`);
    expect(listed.body.meta.total).toBe(1);
  });

  it('does not allow moving an asset to another facility', async () => {
    const f1 = await createFacility(w.ownerA, w.orgA.id, 'F1');
    const f2 = await createFacility(w.ownerA, w.orgA.id, 'F2');
    const asset = await createAsset(w.ownerA, w.orgA.id, f1.id);
    const res = await patch(w.ownerA, `${base(w.orgA.id)}/assets/${asset.id}`, {
      facilityId: f2.id,
    });
    expect(res.status).toBe(400);
  });

  it('has no delete endpoint', async () => {
    const facility = await createFacility(w.ownerA, w.orgA.id);
    const res = await w.ownerA.agent
      .delete(`${base(w.orgA.id)}/facilities/${facility.id}`)
      .set(CSRF_HEADER, w.ownerA.csrfToken);
    expect(res.status).toBe(404);
    expect(await prisma.facility.count()).toBe(1);
  });
});

describe('concurrent changes to flare sources', () => {
  const ROUNDS = 8;

  async function createSources(count: number) {
    const facility = await createFacility(w.ownerA, w.orgA.id);
    const asset = await createAsset(w.ownerA, w.orgA.id, facility.id);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const res = await post(w.ownerA, `${base(w.orgA.id)}/flare-sources`, {
        assetId: asset.id,
        name: `Flare ${i}`,
        code: `FL-${i}`,
      });
      expect(res.status).toBe(201);
      ids.push(res.body.data.id as string);
    }
    return ids;
  }

  it('archives a flare source exactly once when two archive requests race', async () => {
    const ids = await createSources(ROUNDS);
    const results = await Promise.all(
      ids.flatMap((id) => [
        post(w.ownerA, `${base(w.orgA.id)}/flare-sources/${id}/archive`, {}),
        post(w.ownerA, `${base(w.orgA.id)}/flare-sources/${id}/archive`, {}),
      ]),
    );

    for (let i = 0; i < ids.length; i++) {
      const pair = [results[2 * i]!.status, results[2 * i + 1]!.status].sort();
      expect(pair).toEqual([200, 409]);
    }
    const archivedAudits = await prisma.auditLog.count({
      where: { action: 'flare_source.archived' },
    });
    expect(archivedAudits).toBe(ROUNDS);
  });

  it('never applies an edit to a flare source after it has been archived', async () => {
    const ids = await createSources(ROUNDS);
    const results = await Promise.all(
      ids.flatMap((id) => [
        post(w.ownerA, `${base(w.orgA.id)}/flare-sources/${id}/archive`, {}),
        patch(w.ownerA, `${base(w.orgA.id)}/flare-sources/${id}`, { name: 'Edited' }),
      ]),
    );

    for (let i = 0; i < ids.length; i++) {
      expect(results[2 * i]!.status).toBe(200);
      const editStatus = results[2 * i + 1]!.status;
      expect([200, 409]).toContain(editStatus);

      // A successful edit returns the row as updated; it must never land on an archived row.
      if (editStatus === 200) {
        expect(results[2 * i + 1]!.body.data.status).toBe('ACTIVE');
      }
    }
  });
});
