import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigation } from 'react-router';
import { BrandLockup } from '@/components/brand';
import { Activity, BookOpen, ClipboardCheck, Factory, Settings, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/features/auth/user-menu';
import { preloadPage, type PageName } from '../lazy-pages';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  page: PageName;
}

/**
 * Application shell. A sidebar on wider screens; on phones the same content stacks
 * into a header with a horizontally scrollable navigation row.
 */
export function AppLayout({
  organisationSlot,
  basePath,
  showReview = false,
  isPlatformAdmin = false,
}: {
  organisationSlot?: ReactNode;
  /** Organisation route prefix, e.g. /o/:id. Without it, only the account menu shows. */
  basePath?: string;
  /** Show the review queues (the user can review or approve). A display aid only. */
  showReview?: boolean;
  /** Show the methodology registry administration. A display aid only. */
  isPlatformAdmin?: boolean;
}) {
  const nav: NavItem[] = basePath
    ? [
        {
          to: `${basePath}/facilities`,
          label: 'Facilities',
          icon: <Factory aria-hidden />,
          page: 'facilities',
        },
        ...(showReview
          ? [
              {
                to: `${basePath}/review`,
                label: 'Review',
                icon: <ClipboardCheck aria-hidden />,
                page: 'review' as const,
              },
            ]
          : []),
        {
          to: '/methodology',
          label: 'Methodology',
          icon: <BookOpen aria-hidden />,
          page: 'methodology',
        },
        ...(isPlatformAdmin
          ? [
              {
                to: '/admin/methodology',
                label: 'Methodology registry',
                icon: <ShieldCheck aria-hidden />,
                page: 'adminMethodology' as const,
              },
            ]
          : []),
        {
          to: `${basePath}/settings`,
          label: 'Settings',
          icon: <Settings aria-hidden />,
          page: 'settings',
        },
        {
          to: `${basePath}/system`,
          label: 'System status',
          icon: <Activity aria-hidden />,
          page: 'system',
        },
      ]
    : [];
  const navigation = useNavigation();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      {navigation.state !== 'idle' && <RouteProgress />}
      <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-b-0">
        <div className="px-4 pt-4 pb-3">
          <Link
            to="/"
            className="inline-block rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-primary/50"
            aria-label="Flame home"
          >
            <BrandLockup subtitle="Emissions management" />
          </Link>
        </div>

        {organisationSlot && <div className="px-2 pb-2">{organisationSlot}</div>}

        {nav.length > 0 && (
          <nav aria-label="Main" className="px-2 pb-3 md:flex-1">
            <ul className="flex gap-1 overflow-x-auto md:flex-col">
              {nav.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onMouseEnter={() => {
                      preloadPage(item.page);
                    }}
                    onFocus={() => {
                      preloadPage(item.page);
                    }}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-sidebar-primary/50 [&_svg]:size-4',
                        isActive &&
                          'bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary',
                      )
                    }
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="border-t border-sidebar-border p-2 md:mt-auto">
          <UserMenu />
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 md:px-8 md:py-8">
        {/* Keyed by organisation so per-page state (filters, open dialogs) resets on switch. */}
        <Outlet key={basePath} />
      </main>
    </div>
  );
}

/**
 * A thin bar across the top while the next page loads. It appears only after a short
 * delay, so instant navigations never flash it. Static under reduced motion.
 */
function RouteProgress() {
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
      role="progressbar"
      aria-label="Loading page"
    >
      <div className="route-progress h-full bg-primary" />
    </div>
  );
}
