import { useEffect } from 'react';
import { BookOpen, Building2, Factory, ShieldCheck, UserCog } from 'lucide-react';
import { useCurrentSession } from '@/features/auth/require-auth';
import { NoOrganisationNotice } from '@/features/auth/no-organisation-notice';
import { preloadAllPagesWhenIdle } from '../lazy-pages';
import { AppLayout, type NavItem } from './app-layout';

/**
 * Shell for platform administration pages (outside any organisation): the same sidebar
 * and narrow-screen top bar as the rest of the app, with the registry, organisations and
 * Platform Administrators (for administrators), the published
 * methodology and, for administrators who belong to an organisation, a way back to it.
 * Administrators without one see a notice explaining that and offering to switch account.
 */
export function AdminLayout() {
  const { memberships, user } = useCurrentSession();
  const first = memberships[0];
  useEffect(preloadAllPagesWhenIdle, []);

  const items: NavItem[] = [
    {
      to: '/admin/methodology',
      label: 'Methodology registry',
      icon: <ShieldCheck aria-hidden />,
      page: 'adminMethodology',
    },
    // Shown to Platform Administrators only; others see the pages' own refusal anyway.
    ...(user.isPlatformAdmin
      ? [
          {
            to: '/admin/organisations',
            label: 'Organisations',
            icon: <Building2 aria-hidden />,
            page: 'adminOrganisations' as const,
          },
          {
            to: '/admin/platform-admins',
            label: 'Platform administrators',
            icon: <UserCog aria-hidden />,
            page: 'adminPlatformAdmins' as const,
          },
        ]
      : []),
    ...(first
      ? [
          {
            to: `/o/${first.organisationId}/facilities`,
            label: 'Facilities',
            icon: <Factory aria-hidden />,
            page: 'facilities' as const,
          },
          {
            to: `/o/${first.organisationId}/methodology`,
            label: 'Methodology',
            icon: <BookOpen aria-hidden />,
            page: 'methodology' as const,
          },
        ]
      : [
          {
            to: '/methodology',
            label: 'Published methodology',
            icon: <BookOpen aria-hidden />,
            page: 'methodology' as const,
          },
        ]),
  ];
  // Only for administrators: others here see the page's own "administrators only" state.
  const notice = !first && user.isPlatformAdmin ? <NoOrganisationNotice /> : undefined;
  return <AppLayout items={items} notice={notice} />;
}
