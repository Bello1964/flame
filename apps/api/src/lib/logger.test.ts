import { Writable } from 'node:stream';
import { beforeEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER } from '@carbon/shared';
import { createLogger } from './logger.js';
import request from 'supertest';
import {
  PASSWORD,
  createUser,
  login,
  makeApp,
  resetDatabase,
  testConfig,
} from '../test/context.js';

/** Collects every log line the app writes. */
function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger('info', stream), output: () => lines.join('') };
}

beforeEach(async () => {
  await resetDatabase();
});

describe('request logging', () => {
  it('redacts the session cookie and CSRF token from request logs', async () => {
    await createUser('ada@example.com');
    const { logger, output } = captureLogs();
    const app = makeApp({ logger });
    const { agent, csrfToken } = await login(app, 'ada@example.com');

    await agent.post('/api/v1/auth/logout').set(CSRF_HEADER, csrfToken);

    const logs = output();
    expect(logs).toContain('"x-csrf-token":"[REDACTED]"');
    expect(logs).toContain('"cookie":"[REDACTED]"');
    expect(logs).not.toContain(csrfToken);
    expect(logs).not.toMatch(/carbon_sid=[^;"[]/);
  });

  it('warns once when a proxy header arrives but TRUST_PROXY is 0', async () => {
    const { logger, output } = captureLogs();
    const app = makeApp({ logger });
    await request(app).get('/api/v1/health').set('X-Forwarded-For', '203.0.113.7');
    await request(app).get('/api/v1/health').set('X-Forwarded-For', '203.0.113.8');

    const warnings = output().match(/TRUST_PROXY is 0/g) ?? [];
    expect(warnings).toHaveLength(1);
  });

  it('does not warn about proxies when TRUST_PROXY is set', async () => {
    const { logger, output } = captureLogs();
    const app = makeApp({ logger, config: { ...testConfig, trustProxy: 1 } });
    await request(app).get('/api/v1/health').set('X-Forwarded-For', '203.0.113.7');
    expect(output()).not.toMatch(/TRUST_PROXY is 0/);
  });

  it('never logs the password from a sign-in request', async () => {
    await createUser('ada@example.com');
    const { logger, output } = captureLogs();
    await login(makeApp({ logger }), 'ada@example.com');
    expect(output()).not.toContain(PASSWORD);
  });
});
