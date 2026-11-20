import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from '../test/context.js';

const dist = mkdtempSync(path.join(tmpdir(), 'flame-web-'));
mkdirSync(path.join(dist, 'assets'));
writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Flame</title>');
writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.info(1);');
writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
});

const app = makeApp({ webAppDir: dist });

describe('serving the web app from the API origin', () => {
  it('serves index.html for the root and for client-side routes, uncached', async () => {
    for (const url of ['/', '/sign-in', '/organisations/x/facilities?tab=assets']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.text).toContain('<title>Flame</title>');
    }
  });

  it('caches hashed build files for a year and other files briefly', async () => {
    const asset = await request(app).get('/assets/index-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const icon = await request(app).get('/favicon.svg');
    expect(icon.status).toBe(200);
    expect(icon.headers['cache-control']).toBe('public, max-age=300');
  });

  it('answers a missing build file with 404, not the HTML page', async () => {
    const res = await request(app).get('/assets/missing-999.js');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('<title>Flame</title>');
  });

  it('leaves the API alone: unknown API routes still get the JSON 404', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    const health = await request(app).get('/api/v1/health');
    expect(health.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('does not answer state-changing requests with the HTML page', async () => {
    const res = await request(app).post('/sign-in').send({});
    expect(res.status).not.toBe(200);
  });

  it('allows the pinned Swagger UI CDN in the Content Security Policy, nothing wider', async () => {
    const csp = (await request(app).get('/')).headers['content-security-policy'] ?? '';
    expect(csp).toContain("script-src 'self' https://cdn.jsdelivr.net");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it('is not served when no build directory is given', async () => {
    const res = await request(makeApp()).get('/sign-in');
    expect(res.status).toBe(404);
  });
});
