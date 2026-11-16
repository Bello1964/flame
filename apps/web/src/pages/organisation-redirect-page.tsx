import { Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { EmptyState, FullPageState } from '@/components/page-state';
import { useCurrentSession } from '@/features/auth/require-auth';
import { useLogout } from '@/features/auth/session';

/** "/app" sends the user into their first organisation (memberships are sorted by name). */
export function OrganisationRedirectPage() {
  const { memberships, user } = useCurrentSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const first = memberships[0];

  if (first) return <Navigate to={`/o/${first.organisationId}/facilities`} replace />;
  // A Platform Administrator without organisation access works in the registry.
  if (user.isPlatformAdmin) return <Navigate to="/admin/methodology" replace />;

  return (
    <FullPageState>
      <EmptyState
        title="No organisation access yet"
        description="Your account isn’t a member of any organisation. Ask an organisation owner to add you."
        action={
          <Button
            variant="outline"
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
            Sign out
          </Button>
        }
      />
    </FullPageState>
  );
}
