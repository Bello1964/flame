import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ensureAppLogin } from './db-roles.js';
import { testDatabaseUrl } from '../test/test-database.js';

const PROBE = 'flame_role_probe';
const PASSWORD = 'probe-password-123';

let owner: pg.Client;

async function dropProbe() {
  await owner.query(`DROP OWNED BY ${PROBE}`).catch(() => undefined);
  await owner.query(`DROP ROLE IF EXISTS ${PROBE}`);
}

beforeAll(async () => {
  owner = new pg.Client({ connectionString: testDatabaseUrl() });
  await owner.connect();
});

afterEach(dropProbe);

afterAll(async () => {
  await owner.end();
});

describe('ensureAppLogin', () => {
  it('creates a new login in flame_app', async () => {
    await expect(ensureAppLogin(owner, PROBE, PASSWORD)).resolves.toBe('created');
    const member = await owner.query<{ m: boolean }>(
      `SELECT pg_has_role($1, 'flame_app', 'MEMBER') AS m`,
      [PROBE],
    );
    expect(member.rows[0]?.m).toBe(true);
  });

  it('updates an existing plain login', async () => {
    await owner.query(`CREATE ROLE ${PROBE} LOGIN`);
    await expect(ensureAppLogin(owner, PROBE, PASSWORD)).resolves.toBe('updated');
  });

  it.each([
    ['SUPERUSER', 'superuser'],
    ['CREATEROLE', 'can create roles'],
    ['CREATEDB', 'can create databases'],
    ['REPLICATION', 'replication'],
    ['BYPASSRLS', 'bypasses row-level security'],
  ])('refuses to take over an existing role with %s', async (attribute) => {
    await owner.query(`CREATE ROLE ${PROBE} LOGIN ${attribute}`);
    await expect(ensureAppLogin(owner, PROBE, PASSWORD)).rejects.toThrow(/Refusing/);
    // The role was left untouched: still not a member of flame_app.
    const member = await owner.query<{ m: boolean }>(
      `SELECT pg_has_role($1, 'flame_app', 'MEMBER') AS m`,
      [PROBE],
    );
    expect(member.rows[0]?.m).toBe(attribute === 'SUPERUSER');
  });

  it('refuses to take over a role that owns database objects', async () => {
    await owner.query(`CREATE ROLE ${PROBE} LOGIN`);
    await owner.query(`CREATE TABLE probe_owned (id int)`);
    await owner.query(`ALTER TABLE probe_owned OWNER TO ${PROBE}`);
    try {
      await expect(ensureAppLogin(owner, PROBE, PASSWORD)).rejects.toThrow(/owns database objects/);
    } finally {
      await owner.query(`DROP TABLE probe_owned`);
    }
  });

  it('refuses to turn the connected owner into the app login', async () => {
    const current = await owner.query<{ u: string }>('SELECT current_user AS u');
    await expect(ensureAppLogin(owner, current.rows[0]!.u, PASSWORD)).rejects.toThrow(/Refusing/);
  });
});
