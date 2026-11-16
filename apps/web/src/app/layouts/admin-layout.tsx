import { useEffect } from 'react';
import { BookOpen, Factory, ShieldCheck } from 'lucide-react';
import { useCurrentSession } from '@/features/auth/require-auth';
import { preloadAllPagesWhenIdle } from '../lazy-pages';
import { AppLayout, type NavItem } from './app-layout';

/**
 * Shell for platform administration pages (outside any organisation): the same sidebar
 * and narrow-screen top bar as the rest of the app, with the registry, the published
 * methodology and, for administrators who belong to an organisation, a way back to it.
 */
export function AdminLayout() {
  const { memberships } = useCurrentSession();
  const first = memberships[0];
  useEffect(preloadAllPagesWhenIdle, []);

  const items: NavItem[] = [
    {
      to: '/admin/methodology',
      label: 'Methodology registry',
      icon: <ShieldCheck aria-hidden />,
      page: 'adminMethodology',
    },
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
  return <AppLayout items={items} />;
}
