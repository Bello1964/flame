import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { mockApi, on, renderApp } from '@/test/render-app';

const signedOut = on('GET', '/auth/session', () => ({
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.SwaggerUIBundle;
  document.querySelectorAll('script[src*="swagger-ui"], link[data-swagger-ui]').forEach((n) => {
    n.remove();
  });
});

describe('the API reference page', () => {
  it('renders the API’s own OpenAPI description, read-only', async () => {
    mockApi(signedOut);
    const bundle = vi.fn();
    window.SwaggerUIBundle = bundle;
    renderApp('/docs');

    await waitFor(() => {
      expect(bundle).toHaveBeenCalledOnce();
    });
    expect(bundle.mock.calls[0]![0]).toMatchObject({
      url: '/api/v1/openapi.json',
      supportedSubmitMethods: [],
    });
    expect(screen.getByRole('link', { name: 'OpenAPI JSON' })).toHaveAttribute(
      'href',
      '/api/v1/openapi.json',
    );
  });

  it('loads a pinned Swagger UI with integrity checks', async () => {
    mockApi(signedOut);
    renderApp('/docs');
    expect(await screen.findByText('Loading the API reference…')).toBeInTheDocument();
    const script = document.querySelector<HTMLScriptElement>('script[src*="swagger-ui"]');
    expect(script?.src).toMatch(/swagger-ui-dist@\d+\.\d+\.\d+\/swagger-ui-bundle\.js$/);
    expect(script?.integrity).toMatch(/^sha384-/);
    expect(script?.crossOrigin).toBe('anonymous');
    const style = document.querySelector<HTMLLinkElement>('link[data-swagger-ui]');
    expect(style?.integrity).toMatch(/^sha384-/);
  });

  it('adds the viewer script only once, however often the page is opened', async () => {
    mockApi(signedOut);
    const first = renderApp('/docs');
    expect(await screen.findByText('Loading the API reference…')).toBeInTheDocument();
    const scripts = () => document.querySelectorAll('script[src*="swagger-ui"]').length;
    const afterFirstVisit = scripts();
    expect(afterFirstVisit).toBeLessThanOrEqual(1);
    first.unmount();
    renderApp('/docs');
    expect(await screen.findByText('Loading the API reference…')).toBeInTheDocument();
    // The load still in progress is reused: no second copy of the 1.4 MB bundle.
    expect(scripts()).toBe(afterFirstVisit);
  });

  it('is linked from the landing page', async () => {
    mockApi(signedOut);
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'API reference' })).toHaveAttribute(
      'href',
      '/docs',
    );
  });
});
