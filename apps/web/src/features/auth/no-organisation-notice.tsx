import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Info, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api-client';
import { useLogout } from './session';

/**
 * Shown on platform administration pages to a Platform Administrator who belongs to no
 * organisation. That account has no organisation access by design (ARCHITECTURAL_WORKFLOW.md
 * §6), so facilities, reports and settings are reached by signing in with an organisation
 * account. The notice says so and offers the switch directly.
 */
export function NoOrganisationNotice() {
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <section
      role="note"
      aria-labelledby="no-organisation-heading"
      className="mb-6 flex flex-col gap-3 rounded-md border border-border bg-secondary/60 p-4 sm:flex-row sm:items-center sm:justify-between print:hidden"
    >
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <p id="no-organisation-heading" className="text-sm font-medium">
            This account has no organisation access
          </p>
          <p className="text-sm text-muted-foreground">
            It administers the methodology registry only. To work with an organisation’s facilities,
            activity data, reports or settings, sign in with an account that belongs to that
            organisation.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 self-start sm:self-center"
        disabled={logout.isPending}
        onClick={() => {
          logout.mutate(false, {
            onSuccess: () => void navigate('/login', { replace: true }),
            onError: (error) => {
              // 401: the session had already ended; the app has returned to sign-in.
              if (error instanceof ApiError && error.status === 401) return;
              toast.error(`Could not sign out. ${errorMessage(error)}`);
            },
          });
        }}
      >
        <LogOut aria-hidden />
        Sign out and switch account
      </Button>
    </section>
  );
}
