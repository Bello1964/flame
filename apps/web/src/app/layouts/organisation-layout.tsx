import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { preloadAllPagesWhenIdle } from '../lazy-pages';
import { EmptyState } from '@/components/page-state';
import { Button } from '@/components/ui/button';
import { useCurrentSession } from '@/features/auth/require-auth';
import { canApproveActivity, canReviewActivity } from '@/features/organisations/permissions';
import { OrganisationProvider } from '@/features/organisations/organisation-context';
import { OrganisationSwitcher } from '@/features/organisations/organisation-switcher';
import { AppLayout } from './app-layout';

/**
 * Scopes everything beneath /o/:organisationId to one of the user's memberships.
 * The membership list only decides what to display; the API independently checks
 * membership on every request.
 */
export function OrganisationLayout() {
  const { organisationId } = useParams();
  const { memberships, user } = useCurrentSession();
  const membership = memberships.find((m) => m.organisationId === organisationId);

  // Fetch the remaining pages' code in the background so moving between them is instant.
  useEffect(preloadAllPagesWhenIdle, []);

  if (!membership) {
    return <OrganisationUnavailable />;
  }

  return (
    <OrganisationProvider membership={membership}>
      <AppLayout
        basePath={`/o/${membership.organisationId}`}
        isPlatformAdmin={user.isPlatformAdmin}
        showReview={canReviewActivity(membership.roles) || canApproveActivity(membership.roles)}
        organisationSlot={<OrganisationSwitcher />}
      />
    </OrganisationProvider>
  );
}

function OrganisationUnavailable() {
  const { memberships } = useCurrentSession();
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        title="Organisation not available"
        description="It doesn’t exist, or you aren’t a member of it."
        action={
          memberships.length > 0 ? (
            <Button asChild variant="outline">
              <Link to="/app">Go to your organisations</Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
