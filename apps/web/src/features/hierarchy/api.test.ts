import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { FacilityDto } from '@carbon/shared';
import { facility, ORG_A } from '@/test/render-app';
import { firstPageParams, hierarchyKeys, listQuery, seedRecordCaches } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const detailKey = (id: string) => hierarchyKeys.detail(ORG_A, 'facilities', id);

describe('seedRecordCaches', () => {
  it('fills missing and older records, but never overwrites a newer one', () => {
    const client = new QueryClient();
    const listStartedAt = 1_000;
    const missing = facility({ id: 'f0000000-0000-4000-8000-0000000000a1', name: 'From list' });
    const older = facility({ id: 'f0000000-0000-4000-8000-0000000000a2', name: 'From list' });
    const newer = facility({ id: 'f0000000-0000-4000-8000-0000000000a3', name: 'From list' });

    client.setQueryData(detailKey(older.id), { ...older, name: 'Old copy' }, { updatedAt: 500 });
    // e.g. a save that finished while the list request was in flight
    client.setQueryData(
      detailKey(newer.id),
      { ...newer, name: 'Just saved' },
      { updatedAt: 1_500 },
    );

    seedRecordCaches(client, ORG_A, 'facilities', [missing, older, newer], listStartedAt);

    expect(client.getQueryData<FacilityDto>(detailKey(missing.id))?.name).toBe('From list');
    expect(client.getQueryData<FacilityDto>(detailKey(older.id))?.name).toBe('From list');
    expect(client.getQueryData<FacilityDto>(detailKey(newer.id))?.name).toBe('Just saved');
    // Seeded copies are dated when the list was requested, not when it arrived.
    expect(client.getQueryState(detailKey(missing.id))?.dataUpdatedAt).toBe(listStartedAt);
  });
});

describe('list query', () => {
  it('passes the abort signal to fetch and writes nothing after being cancelled', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let respond: (res: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      (_input: string, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = client
      .query(listQuery(ORG_A, 'facilities', firstPageParams()))
      .catch(() => undefined);
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);

    await client.cancelQueries();
    // The (fake) server answers anyway, after the cancellation.
    respond(
      new Response(
        JSON.stringify({ data: [facility()], meta: { page: 1, pageSize: 25, total: 1 } }),
        {
          status: 200,
        },
      ),
    );
    await pending;
    await new Promise((r) => setTimeout(r, 0));

    expect(client.getQueryData(detailKey(facility().id))).toBeUndefined();
  });
});
