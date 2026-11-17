import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { FlaskConical, Mail } from 'lucide-react';
import type { DataResponse, DevMailboxEmailDto } from '@flame/shared';
import { EmptyState, ErrorState, LoadingState } from '@/components/page-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError, apiGet } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { NotFoundPage } from './not-found-page';

const LINK = /https?:\/\/[^\s<>"']+/g;

function linksIn(text: string): string[] {
  return [...new Set(text.match(LINK) ?? [])];
}

/**
 * /dev/mailbox: emails the API queued, with their links, so invitations can be tried
 * locally without an email provider. Only in Vite development builds; the API mounts
 * GET /dev/mailbox only when it runs with NODE_ENV=development.
 */
export function DevMailboxPage() {
  if (!import.meta.env.DEV) return <NotFoundPage />;
  return <DevMailbox />;
}

function DevMailbox() {
  const emails = useQuery({
    queryKey: ['dev', 'mailbox'],
    queryFn: async ({ signal }) =>
      (await apiGet<DataResponse<DevMailboxEmailDto[]>>('/dev/mailbox', { signal })).data,
  });

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
        <header className="space-y-2">
          <Badge variant="outline" className="border-warning/50 bg-warning/10">
            <FlaskConical aria-hidden />
            Development only
          </Badge>
          <h1 className="text-2xl font-semibold">Development mailbox</h1>
          <p className="text-sm text-muted-foreground">
            The 50 most recent emails the API queued. Nothing here is sent anywhere: this page and
            its API exist only in development. Links are removed once an email is actually sent.
          </p>
        </header>

        {emails.isPending ? (
          <LoadingState label="Loading emails…" />
        ) : emails.isError ? (
          emails.error instanceof ApiError && emails.error.status === 404 ? (
            <EmptyState
              title="The development mailbox isn’t available"
              description="The API serves it only when it runs with NODE_ENV=development. Start the API in development mode and reload."
            />
          ) : (
            <ErrorState
              title="Could not load the mailbox"
              error={emails.error}
              onRetry={() => void emails.refetch()}
            />
          )
        ) : emails.data.length === 0 ? (
          <EmptyState
            title="No emails yet"
            description="Invite someone, then reload this page."
            action={
              <Button variant="outline" onClick={() => void emails.refetch()}>
                Reload
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={emails.isFetching}
                onClick={() => void emails.refetch()}
              >
                {emails.isFetching ? 'Reloading…' : 'Reload'}
              </Button>
            </div>
            <ul className="space-y-3">
              {emails.data.map((email) => (
                <EmailItem key={email.id} email={email} />
              ))}
            </ul>
          </>
        )}
        <p className="text-sm">
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            Back to Flame
          </Link>
        </p>
      </main>
    </div>
  );
}

function EmailItem({ email }: { email: DevMailboxEmailDto }) {
  const links = linksIn(email.text);
  return (
    <li className="space-y-2 rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {email.subject}
        </p>
        <Badge variant="outline" className="font-normal">
          {email.status}
        </Badge>
      </div>
      <p className="text-xs break-all text-muted-foreground">
        To {email.to} · {email.template} · {formatDateTime(email.createdAt)}
      </p>
      {links.length > 0 ? (
        <ul className="space-y-1">
          {links.map((href) => (
            <li key={href}>
              <a
                href={href}
                className="text-sm break-all text-primary underline underline-offset-4"
              >
                {href}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No link in this email.</p>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Show the text</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">
          {email.text}
        </pre>
      </details>
    </li>
  );
}
