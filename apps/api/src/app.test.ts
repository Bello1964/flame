import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from './test/context.js';

describe('GET /api/v1/health', () => {
  it('returns 200 when the database is reachable', async () => {
    const res = await request(makeApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('returns 503 when the database is unavailable', async () => {
    const app = makeApp({ checkDatabase: () => Promise.resolve(false) });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'ok', database: 'unavailable' });
  });
});

describe('unknown routes and malformed input', () => {
  it('returns the standard error body without internal details', async () => {
    const res = await request(makeApp()).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('rejects malformed JSON with 400, not 500', async () => {
    const res = await request(makeApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'BAD_REQUEST' } });
  });

  it('does not expose the x-powered-by header', async () => {
    const res = await request(makeApp()).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
