import type { ReactNode } from 'react';
import { EmptyState } from '@/components/page-state';
import { useCurrentSession } from '@/features/auth/require-auth';

/**
 * Renders platform administration only for Platform Administrators. A display aid: the
 * API refuses these requests to anyone else.
 */
export function PlatformAdminOnly({ children }: { children: ReactNode }) {
  const { user } = useCurrentSession();
  if (!user.isPlatformAdmin) {
    return (
      <EmptyState
        title="For Platform Administrators only"
        description="Organisations and Platform Administrators are managed by Platform Administrators."
      />
    );
  }
  return children;
}
