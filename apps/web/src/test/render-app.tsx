import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { FacilityDto, MembershipSummary, Role, SessionResponse } from '@carbon/shared';
import { routes } from '@/app/router';
import { Toaster } from '@/components/ui/sonner';
import { createQueryClient } from '@/lib/query-client';
import { setCsrfToken } from '@/lib/api-client';

export const ORG_A = '11111111-1111-4111-8111-111111111111';
export const ORG_B = '22222222-2222-4222-8222-222222222222';

export function membership(
  organisationId: string,
  roles: Role[],
  name = organisationId === ORG_A ? 'Delta Energy' : 'Niger Gas',
): MembershipSummary {
  return { organisationId, organisationName: name, organisationSlug: name, roles };
}

export function sessionWith(memberships: MembershipSummary[]): SessionResponse {
  return {
    user: { id: 'user-1', email: 'ada@example.com', name: 'Ada Obi', isPlatformAdmin: false },
    memberships,
    csrfToken: 'csrf-123',
  };
}

export function facility(overrides: Partial<FacilityDto> = {}): FacilityDto {
  return {
    id: 'f0000000-0000-4000-8000-000000000001',
    organisationId: ORG_A,
    name: 'Okpai Flow Station',
    code: 'OKP-FS',
    description: null,
    status: 'ACTIVE',
    archivedAt: null,
    createdById: 'user-1',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
    region: 'Delta',
    country: 'NG',
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

/** A response, or PENDING to leave the request unanswered (to observe loading states). */
type Reply = { status: number; body?: unknown } | typeof PENDING;
type Handler = (req: RecordedRequest) => Reply | undefined;

export const PENDING = Symbol('pending');

/**
 * Replaces fetch with a tiny API double. Handlers are tried in order; the first to
 * return a response wins. Unhandled requests fail the test loudly.
 */
export function mockApi(...handlers: Handler[]) {
  const requests: RecordedRequest[] = [];
  const fetchMock = vi.fn((input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost');
    const req: RecordedRequest = {
      method: init.method ?? 'GET',
      path: `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    requests.push(req);
    for (const handler of handlers) {
      const res = handler(req);
      if (res === PENDING) return new Promise<Response>(() => undefined);
      if (res) {
        return Promise.resolve(
          res.status === 204
            ? new Response(null, { status: 204 })
            : new Response(JSON.stringify(res.body ?? null), { status: res.status }),
        );
      }
    }
    return Promise.reject(new Error(`Unhandled request: ${req.method} ${req.path}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests };
}

/** Matches method and path (ignoring the query string unless `exact` is set). */
export function on(
  method: string,
  path: string | RegExp,
  respond: (req: RecordedRequest) => Reply,
): Handler {
  return (req) => {
    if (req.method !== method) return undefined;
    const bare = req.path.split('?')[0] ?? '';
    const matches = typeof path === 'string' ? bare === path : path.test(bare);
    return matches ? respond(req) : undefined;
  };
}

export const list = <T,>(data: T[]) => ({
  status: 200,
  body: { data, meta: { page: 1, pageSize: 25, total: data.length } },
});

export function renderApp(path: string) {
  setCsrfToken(null);
  const queryClient = createQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}
