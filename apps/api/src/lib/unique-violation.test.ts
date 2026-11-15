import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { uniqueViolationFields } from './unique-violation.js';

function p2002(meta: Record<string, unknown> | undefined) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    ...(meta ? { meta } : {}),
  });
}

/** The shape this API actually receives from @prisma/adapter-pg (captured from a real run). */
function adapterMeta(modelName: string, table: string, constraint: Record<string, unknown>) {
  return {
    modelName,
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: { originalCode: '23505', kind: 'UniqueConstraintViolation', constraint, table },
    },
  };
}

describe('uniqueViolationFields', () => {
  it.each([
    ['Facility', 'facilities'],
    ['Asset', 'assets'],
    ['FlareSource', 'flare_sources'],
  ])('names the code for a duplicate %s code', (model, table) => {
    const err = p2002(adapterMeta(model, table, { index: `${table}_organisationId_code_key` }));
    expect(uniqueViolationFields(err)).toEqual(['code']);
  });

  it('uses explicit constraint fields when the driver provides them', () => {
    const err = p2002(
      adapterMeta('Facility', 'facilities', { fields: ['organisationId', 'code'] }),
    );
    expect(uniqueViolationFields(err)).toEqual(['code']);
  });

  it('uses meta.target from the query engine', () => {
    expect(
      uniqueViolationFields(p2002({ modelName: 'Asset', target: ['organisationId', 'code'] })),
    ).toEqual(['code']);
  });

  describe('never names fields that could reveal whether an account exists', () => {
    it.each([
      ['User.email (driver adapter)', adapterMeta('User', 'users', { index: 'users_email_key' })],
      ['User.email (query engine)', { modelName: 'User', target: ['email'] }],
      [
        'Organisation.slug',
        adapterMeta('Organisation', 'organisations', { index: 'organisations_slug_key' }),
      ],
      [
        'Membership user/organisation',
        adapterMeta('Membership', 'memberships', {
          index: 'memberships_userId_organisationId_key',
        }),
      ],
      [
        'Session.tokenHash',
        adapterMeta('Session', 'sessions', { index: 'sessions_tokenHash_key' }),
      ],
    ])('%s', (_label, meta) => {
      expect(uniqueViolationFields(p2002(meta))).toBeNull();
    });

    it('names nothing if any clashing column is not allowlisted', () => {
      const err = p2002(adapterMeta('Facility', 'facilities', { fields: ['code', 'name'] }));
      expect(uniqueViolationFields(err)).toBeNull();
    });
  });

  it('never names the server-generated id from the (organisationId, id) index', () => {
    const err = p2002(
      adapterMeta('Facility', 'facilities', { index: 'facilities_organisationId_id_key' }),
    );
    expect(uniqueViolationFields(err)).toBeNull();
  });

  it.each([
    ['no metadata', undefined],
    ['no model name', { target: ['code'] }],
    [
      'a custom index name',
      adapterMeta('Facility', 'facilities', { index: 'custom_unique_thing' }),
    ],
    [
      'an index for a different table',
      adapterMeta('Facility', 'facilities', { index: 'assets_organisationId_code_key' }),
    ],
    [
      'only the tenant column',
      adapterMeta('Facility', 'facilities', { fields: ['organisationId'] }),
    ],
    ['a target that is a string', { modelName: 'Facility', target: 'facilities_code_key' }],
  ])('returns null rather than guessing for %s', (_label, meta) => {
    expect(uniqueViolationFields(p2002(meta))).toBeNull();
  });
});
