import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut, XCircle } from 'lucide-react';
import {
  MEMBERSHIP_ERROR_CODES as CODES,
  INVITATION_VALIDITY_DAYS,
  type InvitationLookupDto,
  type SessionResponse,
} from '@flame/shared';
import { BrandLockup } from '@/components/brand';
import { EmptyState, ErrorState, LoadingState } from '@/components/page-state';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage, fieldErrorsOf } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { replaceSession, sessionQueryKey, useLogout, useSession } from '@/features/auth/session';
import {
  ExistingAccountForm,
  NewAccountForm,
  type AcceptFormError,
} from '@/features/invitations/accept-forms';
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useInvitationLookup,
} from '@/features/invitations/api';
import { ConfirmButton } from '@/features/members/confirm-dialog';
import { membershipErrorMessage, roleList } from '@/features/members/labels';

/**
 * Where to go once accepted: into the organisation joined, or the registry for a Platform
 * Administrator invitation. If the new session somehow lacks that membership, /app decides.
 */
function destination(invitation: InvitationLookupDto, next: SessionResponse): string {
  if (invitation.kind === 'PLATFORM_ADMIN') return '/admin/methodology';
  const joined = next.memberships.some((m) => m.organisationId === invitation.organisationId);
  return joined && invitation.organisationId
    ? `/o/${invitation.organisationId}/facilities`
    : '/app';
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * /invite/:token: public, signed in or out. Looks the invitation up (the token goes in the
 * request body), then offers the one way to accept that fits: create an account, give the
 * existing account's password, or accept as the signed-in account.
 */
export function InvitationPage() {
  const { token = '' } = useParams();
  const session = useSession();
  // Once accepted, the session is replaced (which clears the lookup) and the page leaves.
  const [finished, setFinished] = useState(false);
  // Wait for the session check: with a session, requests must carry its CSRF token.
  const lookup = useInvitationLookup(token, !session.isPending && !finished);

  let content: ReactNode;
  if (session.isPending || lookup.isPending || finished) {
    content = <LoadingState label="Checking your invitation…" />;
  } else if (lookup.isError) {
    content = <LookupError error={lookup.error} onRetry={() => void lookup.refetch()} />;
  } else if (lookup.data.status !== 'PENDING') {
    content = <ClosedInvitation invitation={lookup.data} signedIn={Boolean(session.data)} />;
  } else {
    content = (
      <PendingInvitation
        token={token}
        invitation={lookup.data}
        session={session.data ?? null}
        onAccepted={() => {
          setFinished(true);
        }}
        onStale={() => void lookup.refetch()}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-3">
        <Link to="/" className="inline-block" aria-label="Flame home">
          <BrandLockup tone="light" />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-10">{content}</main>
    </div>
  );
}

function LookupError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
    return (
      <EmptyState
        title="This invitation link isn’t valid"
        description="Check that you opened the whole link from the email. If it still doesn’t work, ask the person who invited you to send a new invitation."
        action={
          <Button asChild variant="outline">
            <Link to="/login">Go to sign in</Link>
          </Button>
        }
      />
    );
  }
  if (error instanceof ApiError && error.status === 429) {
    return <ErrorState title="Too many attempts" error={error} onRetry={onRetry} />;
  }
  return <ErrorState title="Could not check this invitation" error={error} onRetry={onRetry} />;
}

function ClosedInvitation({
  invitation,
  signedIn,
}: {
  invitation: InvitationLookupDto;
  signedIn: boolean;
}) {
  const by = invitation.inviterName;
  const copy: Record<Exclude<InvitationLookupDto['status'], 'PENDING'>, [string, string]> = {
    EXPIRED: [
      'This invitation has expired',
      `Invitations are valid for ${String(INVITATION_VALIDITY_DAYS)} days. Ask ${by} to invite you again.`,
    ],
    REVOKED: [
      'This invitation was withdrawn',
      `${by} revoked it, so the link no longer works. Ask them if you still need access.`,
    ],
    ACCEPTED: [
      'This invitation has already been used',
      'Each invitation link works once. If you accepted it, sign in to continue.',
    ],
    DECLINED: [
      'This invitation was declined',
      `The link no longer works. If you change your mind, ask ${by} to invite you again.`,
    ],
  };
  const [title, description] = copy[invitation.status as keyof typeof copy];
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <Button asChild variant="outline">
          {signedIn ? (
            <Link to="/app">Go to your organisations</Link>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </Button>
      }
    />
  );
}

function InvitationSummary({ invitation }: { invitation: InvitationLookupDto }) {
  const isPlatform = invitation.kind === 'PLATFORM_ADMIN';
  return (
    <header className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {isPlatform
            ? 'You’re invited to become a Platform Administrator'
            : `You’re invited to join ${invitation.organisationName ?? 'an organisation'}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isPlatform
            ? 'Platform Administrators maintain the methodology registry, create organisations and manage other administrators. It gives no access to any organisation’s data.'
            : 'Flame records gas-flaring activity data, emissions calculations and reports for your organisation.'}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-md border bg-card p-4 text-sm">
        <dt className="text-muted-foreground">Invited by</dt>
        <dd>{invitation.inviterName}</dd>
        <dt className="text-muted-foreground">For</dt>
        <dd className="break-all">{invitation.email}</dd>
        {!isPlatform && (
          <>
            <dt className="text-muted-foreground">Roles</dt>
            <dd>{roleList(invitation.roles)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Expires</dt>
        <dd>{formatDateTime(invitation.expiresAt)}</dd>
      </dl>
    </header>
  );
}

/** Turns an accept failure into field or form messages. */
function acceptError(error: unknown): AcceptFormError {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { fields: { password: 'Incorrect password for this account.' } };
    }
    if (error.code === 'VALIDATION_ERROR') {
      const fields = fieldErrorsOf(error);
      const name = fields['name']?.[0];
      const password = fields['password']?.[0];
      if (name !== undefined || password !== undefined) {
        return {
          fields: {
            ...(name !== undefined ? { name } : {}),
            ...(password !== undefined ? { password } : {}),
          },
        };
      }
    }
    // The server names the invited email in these.
    if (
      error.code === CODES.INVITATION_SIGN_IN_REQUIRED ||
      error.code === CODES.INVITATION_WRONG_ACCOUNT
    ) {
      return { form: error.message.endsWith('.') ? error.message : `${error.message}.` };
    }
  }
  return { form: membershipErrorMessage(error) };
}

function PendingInvitation({
  token,
  invitation,
  session,
  onAccepted,
  onStale,
}: {
  token: string;
  invitation: InvitationLookupDto;
  session: SessionResponse | null;
  onAccepted: () => void;
  onStale: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const accept = useAcceptInvitation();
  const [formError, setFormError] = useState<AcceptFormError | null>(null);

  const submit = (details: { name?: string; password?: string }) => {
    setFormError(null);
    accept.mutate(
      { token, ...details },
      {
        onSuccess: (next) => {
          onAccepted();
          // As at sign-in: nothing cached under a previous identity survives.
          replaceSession(queryClient, next);
          toast.success(
            invitation.kind === 'PLATFORM_ADMIN'
              ? 'You’re now a Platform Administrator.'
              : `Welcome to ${invitation.organisationName ?? 'the organisation'}.`,
          );
          void navigate(destination(invitation, next), { replace: true });
        },
        onError: (error) => {
          // Expired, used or revoked meanwhile: show the invitation's current state.
          if (
            error instanceof ApiError &&
            (error.code === CODES.INVITATION_EXPIRED || error.code === CODES.INVITATION_NOT_PENDING)
          ) {
            onStale();
          }
          if (
            error instanceof ApiError &&
            (error.code === CODES.INVITATION_SIGN_IN_REQUIRED ||
              error.code === CODES.INVITATION_WRONG_ACCOUNT)
          ) {
            void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
          }
          setFormError(acceptError(error));
        },
      },
    );
  };

  let action: ReactNode;
  if (session && sameEmail(session.user.email, invitation.email)) {
    action = (
      <div className="space-y-4">
        {formError?.form && (
          <p role="alert" className="text-sm text-destructive">
            {formError.form}
          </p>
        )}
        <p className="text-sm text-muted-foreground">You’re signed in as {session.user.email}.</p>
        <Button
          className="w-full"
          disabled={accept.isPending}
          onClick={() => {
            submit({});
          }}
        >
          {accept.isPending ? 'Accepting…' : 'Accept invitation'}
        </Button>
      </div>
    );
  } else if (session) {
    action = <WrongAccount invitedEmail={invitation.email} signedInEmail={session.user.email} />;
  } else if (invitation.accountExists) {
    action = (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          An account already exists for {invitation.email}. Enter its password to accept and sign
          in. If the account was disabled, accepting turns it back on.
        </p>
        <ExistingAccountForm
          email={invitation.email}
          submitting={accept.isPending}
          error={formError}
          onSubmit={(password) => {
            submit({ password });
          }}
        />
        <p className="text-sm text-muted-foreground">
          Or{' '}
          <Link
            to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            sign in normally
          </Link>{' '}
          and come back to this link.
        </p>
      </div>
    );
  } else {
    action = (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Create your Flame account to accept. You’ll be signed in straight away.
        </p>
        <NewAccountForm
          email={invitation.email}
          submitting={accept.isPending}
          error={formError}
          onSubmit={submit}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <InvitationSummary invitation={invitation} />
      {action}
      <DeclineSection token={token} invitation={invitation} disabled={accept.isPending} />
    </div>
  );
}

function WrongAccount({
  invitedEmail,
  signedInEmail,
}: {
  invitedEmail: string;
  signedInEmail: string;
}) {
  const logout = useLogout();
  return (
    <section
      role="note"
      aria-labelledby="wrong-account-heading"
      className="space-y-3 rounded-md border border-warning/50 bg-warning/10 p-4"
    >
      <p id="wrong-account-heading" className="text-sm font-medium">
        You’re signed in as a different account
      </p>
      <p className="text-sm text-muted-foreground">
        This invitation is for {invitedEmail}, but you’re signed in as {signedInEmail}. Sign out
        here to accept it as {invitedEmail}.
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={logout.isPending}
        onClick={() => {
          logout.mutate(false, {
            onError: (error) => {
              // 401: the session had already ended, which is what was wanted.
              if (error instanceof ApiError && error.status === 401) return;
              toast.error(`Could not sign out. ${errorMessage(error)}`);
            },
          });
        }}
      >
        <LogOut aria-hidden />
        Sign out of {signedInEmail}
      </Button>
    </section>
  );
}

function DeclineSection({
  token,
  invitation,
  disabled,
}: {
  token: string;
  invitation: InvitationLookupDto;
  disabled: boolean;
}) {
  const decline = useDeclineInvitation(token);
  return (
    <div className="border-t pt-4 text-sm text-muted-foreground">
      <p className="mb-2">
        Not expecting this, or don’t want to join? You don’t need an account to decline.
      </p>
      <ConfirmButton
        trigger={
          <Button variant="outline" size="sm" disabled={disabled}>
            <XCircle aria-hidden />
            Decline invitation
          </Button>
        }
        title="Decline this invitation?"
        description={
          <p>
            The link stops working. If you change your mind, {invitation.inviterName} will need to
            invite you again.
          </p>
        }
        confirmLabel="Decline invitation"
        pendingLabel="Declining…"
        pending={decline.isPending}
        error={decline.error}
        onOpen={decline.reset}
        onConfirm={(done) => {
          decline.mutate(undefined, {
            onSuccess: () => {
              toast.success('Invitation declined.');
              done();
            },
          });
        }}
      />
    </div>
  );
}
