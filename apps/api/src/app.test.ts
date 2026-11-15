import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createLogger } from './lib/logger.js';

const logger = createLogger('silent');

describe('GET /api/v1/health', () => {
  it('returns 200 when the database is reachable', async () => {
    const app = createApp({ logger, checkDatabase: async () => true });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('returns 503 when the database is unavailable', async () => {
    const app = createApp({ logger, checkDatabase: async () => false });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'ok', database: 'unavailable' });
  });
});

describe('unknown routes', () => {
  it('returns the standard error body without internal details', async () => {
    const app = createApp({ logger, checkDatabase: async () => true });
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('does not expose the x-powered-by header', async () => {
    const app = createApp({ logger, checkDatabase: async () => true });
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
