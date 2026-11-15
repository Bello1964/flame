import { isRouteErrorResponse, useRouteError } from 'react-router';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FullPageState } from '@/components/page-state';

/** True when a page's code could not be downloaded (offline, or replaced by a new deploy). */
function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically/i.test(
      error.message,
    )
  );
}

/** Last-resort screen for errors thrown while loading or rendering a route. */
export function RouteErrorPage() {
  const error = useRouteError();
  const chunk = isChunkLoadError(error);
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <FullPageState>
      <div role="alert" className="space-y-3 text-center">
        <AlertTriangle className="mx-auto size-6 text-warning" aria-hidden />
        <h1 className="text-lg font-semibold">
          {chunk
            ? 'This page could not be loaded'
            : notFound
              ? 'Page not found'
              : 'Something went wrong'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {chunk
            ? 'Check your connection. If the app was just updated, reloading fetches the latest version.'
            : 'Reload the page to try again. Nothing you saved has been lost.'}
        </p>
        <Button
          onClick={() => {
            window.location.reload();
          }}
        >
          <RotateCw aria-hidden />
          Reload
        </Button>
      </div>
    </FullPageState>
  );
}
