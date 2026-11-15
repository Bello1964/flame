import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemStatus } from './system-status';

function renderWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SystemStatus />
    </QueryClientProvider>,
  );
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SystemStatus', () => {
  it('shows a loading state first', () => {
    mockFetch(200, { status: 'ok', database: 'ok' });
    renderWithClient();
    expect(screen.getByText(/checking system status/i)).toBeInTheDocument();
  });

  it('shows connected when API and database are healthy', async () => {
    mockFetch(200, { status: 'ok', database: 'ok' });
    renderWithClient();
    expect(await screen.findByText(/database connected/i)).toBeInTheDocument();
  });

  it('shows database unavailable on a 503 health response', async () => {
    mockFetch(503, { status: 'ok', database: 'unavailable' });
    renderWithClient();
    expect(await screen.findByText(/database unavailable/i)).toBeInTheDocument();
  });

  it('shows an error when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderWithClient();
    expect(await screen.findByRole('alert')).toHaveTextContent(/api unreachable/i);
  });
});
