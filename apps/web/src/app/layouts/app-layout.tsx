import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigation } from 'react-router';
import { BrandLockup } from '@/components/brand';
import {
  Activity,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Factory,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/features/auth/user-menu';
import { preloadPage, type PageName } from '../lazy-pages';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  page: PageName;
}

/**
 * Application shell. A sidebar on wider screens. On narrow screens it becomes a top bar:
 * the brand on the left, the organisation and account as compact menus on the right,
 * and the navigation beneath as centred icons a fixed gap apart (each named on hover
 * and to screen readers).
 */
export function AppLayout({
  organisationSlot,
  organisationCompactSlot,
  basePath,
  showReview = false,
  isPlatformAdmin = false,
  items,
  notice,
}: {
  organisationSlot?: ReactNode;
  /** The organisation as a compact menu, for the narrow top bar. */
  organisationCompactSlot?: ReactNode;
  /** Organisation route prefix, e.g. /o/:id. Without it, only the account menu shows. */
  basePath?: string;
  /** Show the review queues (the user can review or approve). A display aid only. */
  showReview?: boolean;
  /** Show the methodology registry administration. A display aid only. */
  isPlatformAdmin?: boolean;
  /** Navigation for pages outside an organisation (e.g. platform administration). */
  items?: NavItem[];
  /** Shown above every page in this shell (e.g. a Platform Administrator without an organisation). */
  notice?: ReactNode;
}) {
  const nav: NavItem[] =
    items ??
    (basePath
      ? [
          {
            to: `${basePath}/facilities`,
            label: 'Facilities',
            icon: <Factory aria-hidden />,
            page: 'facilities',
          },
          {
            to: `${basePath}/reports`,
            label: 'Reports',
            icon: <BarChart3 aria-hidden />,
            page: 'reports',
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
            to: `${basePath}/methodology`,
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
      : []);
  const navigation = useNavigation();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)] print:block">
      {navigation.state !== 'idle' && <RouteProgress />}
      <aside className="print:hidden border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 md:pt-4 md:pb-3">
          <Link
            to="/"
            className="inline-block min-w-0 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-primary/50"
            aria-label="Flame home"
          >
            <BrandLockup subtitle="Emissions management" />
          </Link>
          {/* Narrow screens: organisation and account sit opposite the brand. */}
          <div className="flex shrink-0 items-center gap-1 md:hidden">
            {organisationCompactSlot}
            <UserMenu compact />
          </div>
        </div>

        {organisationSlot && <div className="hidden px-2 pb-2 md:block">{organisationSlot}</div>}

        {nav.length > 0 && (
          <nav aria-label="Main" className="px-2 pb-2 md:flex-1 md:pb-3">
            <ul className="flex flex-wrap justify-center gap-2 md:flex-col md:flex-nowrap md:justify-start md:gap-1">
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
                    title={item.label}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-center gap-2 rounded-md p-2.5 text-sm whitespace-nowrap transition-colors outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-sidebar-primary/50 md:justify-start md:px-3 md:py-2 [&_svg]:size-5 md:[&_svg]:size-4',
                        isActive &&
                          'bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary',
                      )
                    }
                  >
                    {item.icon}
                    {/* Icons only on narrow screens; the name stays available to screen readers. */}
                    <span className="sr-only md:not-sr-only">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="hidden border-t border-sidebar-border p-2 md:mt-auto md:block">
          <UserMenu />
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 md:px-8 md:py-8 print:max-w-none print:p-0">
        {notice}
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
