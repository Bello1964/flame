import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BrandLockup } from '@/components/brand';
import { ErrorState, LoadingState } from '@/components/page-state';

/**
 * Swagger UI from jsDelivr, version pinned and checked with Subresource Integrity: the
 * browser refuses the files if their content differs from what was reviewed. To upgrade,
 * change the version and recompute both hashes (sha384 of each file, base64).
 */
const SWAGGER_UI = {
  version: '5.34.1',
  script: {
    file: 'swagger-ui-bundle.js',
    integrity: 'sha384-XFYN47VzPiDY6qPtxYKg0nqUeW/upo20xf1j2SUE7gT/i35FJB4cuS/71Iegzk8Z',
  },
  style: {
    file: 'swagger-ui.css',
    integrity: 'sha384-4c3vsE5f+trhFyHrFrLM1fFGUn531NIaC7dcqEWIJdoRQJ5CkJbSuSCwXLpaS1KF',
  },
} as const;

const assetUrl = (file: string) =>
  `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI.version}/${file}`;

interface SwaggerUiOptions {
  url: string;
  domNode: HTMLElement;
  deepLinking: boolean;
  /** Empty: reading only, no "Try it out" requests from the public docs. */
  supportedSubmitMethods: string[];
  defaultModelsExpandDepth: number;
  docExpansion: 'list' | 'none' | 'full';
}
type SwaggerUiBundle = (options: SwaggerUiOptions) => unknown;

declare global {
  interface Window {
    SwaggerUIBundle?: SwaggerUiBundle;
  }
}

/** The script load in progress or done, shared by every visit; cleared on failure to retry. */
let loading: Promise<SwaggerUiBundle> | undefined;

/** Adds the stylesheet and script once per page load; resolves when the script is ready. */
function loadSwaggerUi(): Promise<SwaggerUiBundle> {
  if (window.SwaggerUIBundle) return Promise.resolve(window.SwaggerUIBundle);
  loading ??= injectSwaggerUi().catch((err: unknown) => {
    loading = undefined;
    throw err;
  });
  return loading;
}

function injectSwaggerUi(): Promise<SwaggerUiBundle> {
  if (!document.querySelector('link[data-swagger-ui]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = assetUrl(SWAGGER_UI.style.file);
    link.integrity = SWAGGER_UI.style.integrity;
    link.crossOrigin = 'anonymous';
    link.dataset['swaggerUi'] = '';
    document.head.append(link);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = assetUrl(SWAGGER_UI.script.file);
    script.integrity = SWAGGER_UI.script.integrity;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => {
      if (window.SwaggerUIBundle) resolve(window.SwaggerUIBundle);
      else reject(new Error('Swagger UI did not load'));
    };
    script.onerror = () => {
      reject(new Error('Could not load the documentation viewer'));
    };
    document.body.append(script);
  });
}

/**
 * /docs: public API reference, rendered from the API's own OpenAPI description
 * (GET /api/v1/openapi.json). Read-only: requests cannot be sent from this page.
 */
export function ApiDocsPage() {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadSwaggerUi()
      .then((bundle) => {
        if (cancelled || !container.current) return;
        bundle({
          url: '/api/v1/openapi.json',
          domNode: container.current,
          deepLinking: true,
          supportedSubmitMethods: [],
          defaultModelsExpandDepth: 0,
          docExpansion: 'list',
        });
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <Link to="/" className="inline-block" aria-label="Flame home">
          <BrandLockup tone="light" />
        </Link>
        <nav aria-label="Documentation" className="flex gap-4 text-sm">
          <Link to="/methodology" className="text-primary underline-offset-4 hover:underline">
            Methodology
          </Link>
          <a
            href="/api/v1/openapi.json"
            className="text-primary underline-offset-4 hover:underline"
          >
            OpenAPI JSON
          </a>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <h1 className="sr-only">Flame API reference</h1>
        {state === 'loading' && <LoadingState label="Loading the API reference…" />}
        {state === 'error' && (
          <ErrorState
            title="Could not load the API reference"
            error={new Error('The documentation viewer could not be loaded.')}
            onRetry={() => {
              setState('loading');
              setAttempt((n) => n + 1);
            }}
          />
        )}
        {/* Swagger UI renders its own light theme; keep it on a light surface. */}
        <div ref={container} className="rounded-md bg-white text-black" />
      </main>
    </div>
  );
}
