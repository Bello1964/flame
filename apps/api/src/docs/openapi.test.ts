import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { generateSharedSchemas } from '../../scripts/api-schemas.js';
import { makeApp } from '../test/context.js';
import { DOCUMENTED_ROUTES, buildOpenApiDocument, openApiPath } from './openapi.js';
import { sharedSchemas } from './schemas.generated.js';

const API = '/api/v1';
/** Served outside the documented API surface: the description itself. */
const UNDOCUMENTED = new Set(['GET /openapi.json']);

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/**
 * Every route the real app registers, as "METHOD /path" under /api/v1. Mount paths are
 * not kept by Express 5, so Router#use is observed while the app is built.
 */
function registeredRoutes(): Set<string> {
  const mounts = new Map<unknown, string>();
  const proto = Router.prototype as unknown as { use: (...args: unknown[]) => unknown };
  const originalUse = proto.use;
  proto.use = function (this: unknown, ...args: unknown[]) {
    if (typeof args[0] === 'string') {
      for (const fn of args.slice(1).flat()) {
        if (typeof fn === 'function' && 'stack' in fn) mounts.set(fn, args[0]);
      }
    }
    return originalUse.apply(this, args);
  };
  let app: ReturnType<typeof makeApp>;
  try {
    app = makeApp();
  } finally {
    proto.use = originalUse;
  }

  const found = new Set<string>();
  const walk = (stack: Layer[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        const full = `${prefix}${layer.route.path}`.replace(/\/$/, '');
        for (const method of Object.keys(layer.route.methods)) {
          if (method === '_all') continue;
          found.add(
            `${method.toUpperCase()} ${full.startsWith(API) ? full.slice(API.length) : full}`,
          );
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack, prefix + (mounts.get(layer.handle) ?? ''));
      }
    }
  };
  const root = (app as unknown as { router: { stack: Layer[] } }).router;
  walk(root.stack, '');
  return found;
}

describe('OpenAPI description', () => {
  it('documents every route the API serves, and only those', () => {
    const served = registeredRoutes();
    for (const route of UNDOCUMENTED) served.delete(route);
    const documented = new Set(DOCUMENTED_ROUTES.map((r) => `${r.method.toUpperCase()} ${r.path}`));
    expect([...served].filter((r) => !documented.has(r)).sort(), 'undocumented routes').toEqual([]);
    expect([...documented].filter((r) => !served.has(r)).sort(), 'documented but missing').toEqual(
      [],
    );
    expect(documented.size).toBe(DOCUMENTED_ROUTES.length);
  });

  it('keeps the generated response schemas in step with @flame/shared', () => {
    // If this fails, run: npm run docs:schemas -w @flame/api
    expect(sharedSchemas).toEqual(generateSharedSchemas());
  });

  it('resolves every reference and lists every operation once', () => {
    const doc = buildOpenApiDocument();
    const text = JSON.stringify(doc);
    const components = doc['components'] as {
      schemas: Record<string, unknown>;
      responses: Record<string, unknown>;
    };
    for (const [, kind, name] of text.matchAll(/"#\/components\/(schemas|responses)\/([^"]+)"/g)) {
      expect(components[kind as 'schemas' | 'responses'], `${kind}/${name!}`).toHaveProperty(name!);
    }
    const paths = doc['paths'] as Record<string, Record<string, { operationId: string }>>;
    const operationIds = Object.values(paths).flatMap((p) =>
      Object.values(p).map((o) => o.operationId),
    );
    expect(new Set(operationIds).size).toBe(DOCUMENTED_ROUTES.length);
    expect(Object.keys(paths)).toContain(openApiPath('/organisations/:organisationId/facilities'));
  });

  it('documents request bodies from the same validators the routes use', () => {
    const doc = buildOpenApiDocument() as {
      paths: Record<
        string,
        Record<
          string,
          { requestBody?: { content: Record<string, { schema: Record<string, unknown> }> } }
        >
      >;
    };
    const login =
      doc.paths['/auth/login']?.['post']?.requestBody?.content['application/json']?.schema;
    expect(login).toMatchObject({
      type: 'object',
      required: ['email', 'password'],
      additionalProperties: false,
    });
  });

  it('states the real access rule where the route gate is only a first check', () => {
    const doc = buildOpenApiDocument() as {
      paths: Record<
        string,
        Record<string, { description: string; requestBody?: { required: boolean } }>
      >;
    };
    const op = (path: string) => doc.paths[path]?.['post'];
    const ret = op('/organisations/{organisationId}/activity-records/{id}/return');
    expect(ret?.description).toContain('`activity:approve` (Owner, Approver)');
    expect(ret?.description).not.toContain('Viewer)');
    const reject = op('/organisations/{organisationId}/calculations/{id}/reject');
    expect(reject?.description).toContain('`calculation:review`');
    // A comment is optional for submit, so the body may be left out; required for return.
    expect(
      op('/organisations/{organisationId}/activity-records/{id}/submit')?.requestBody?.required,
    ).toBe(false);
    expect(ret?.requestBody?.required).toBe(true);
  });

  it('names the configured session cookie', () => {
    const doc = buildOpenApiDocument({ cookieName: '__Host-flame_sid' }) as {
      components: { securitySchemes: { sessionCookie: { name: string } } };
    };
    expect(doc.components.securitySchemes.sessionCookie.name).toBe('__Host-flame_sid');
  });

  it('is served publicly as JSON', async () => {
    const res = await request(makeApp()).get(`${API}/openapi.json`);
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(50);
  });
});
