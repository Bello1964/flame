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
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/features/auth/user-menu';
import { useActivityList } from '@/features/activity/api';
import { preloadPage, type PageName } from '../lazy-pages';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  page: PageName;
  /** Heading the item sits under in the sidebar. Items without one form a plain list. */
  section?: string;
  /** A small figure beside the label (e.g. records waiting for review). */
  count?: number | undefined;
  countLabel?: string;
}

/**
 * Records waiting in the queues this user is shown on the Review page: "To review" for
 * reviewers, "Awaiting approval" for approvers (the same split as review-page.tsx). A
 * display aid only: the count comes from the same list endpoint as the queues, which the
 * API scopes and authorises on every request.
 */
function useWaitingCount(
  orgId: string | undefined,
  queues: { review: boolean; approve: boolean },
): number | undefined {
  const id = orgId ?? '';
  const review = { enabled: queues.review && id !== '' };
  const approve = { enabled: queues.approve && id !== '' };
  const submitted = useActivityList(id, { page: 1, pageSize: 1, status: 'SUBMITTED' }, review);
  const awaiting = useActivityList(
    id,
    { page: 1, pageSize: 1, status: 'AWAITING_APPROVAL' },
    approve,
  );
  if (!review.enabled && !approve.enabled) return undefined;
  const a = review.enabled ? submitted.data?.meta.total : 0;
  const b = approve.enabled ? awaiting.data?.meta.total : 0;
  return a === undefined || b === undefined ? undefined : a + b;
}

/** "1 record waiting for review", "3 records waiting for review or approval"... */
function waitingLabel(count: number | undefined, review: boolean, approve: boolean): string {
  const what = review && approve ? 'review or approval' : review ? 'review' : 'approval';
  return `${count === 1 ? 'record' : 'records'} waiting for ${what}`;
}

/**
 * Application shell: a Basalt sidebar on wider screens, grouped into Operations,
 * Accounting and Organisation, with a restrained Oxide marker on the active page. On narrow
 * screens it becomes a top bar: the brand on the left, the organisation and account as
 * compact menus on the right, and the navigation beneath as centred icons (each named on
 * hover and to screen readers). The working canvas is Limestone.
 */
export function AppLayout({
  organisationSlot,
  organisationCompactSlot,
  basePath,
  organisationId,
  canReview = false,
  canApprove = false,
  showMembers = false,
  isPlatformAdmin = false,
  items,
  notice,
}: {
  organisationSlot?: ReactNode;
  /** The organisation as a compact menu, for the narrow top bar. */
  organisationCompactSlot?: ReactNode;
  /** Organisation route prefix, e.g. /o/:id. Without it, only the account menu shows. */
  basePath?: string;
  /** The organisation in view, for the review count. */
  organisationId?: string;
  /** The user's roles include reviewing activity (the "To review" queue). A display aid only. */
  canReview?: boolean;
  /** The user's roles include approving activity (the "Awaiting approval" queue). */
  canApprove?: boolean;
  /** Show members and invitations (the user's roles include members:read). A display aid only. */
  showMembers?: boolean;
  /** Show the methodology registry administration. A display aid only. */
  isPlatformAdmin?: boolean;
  /** Navigation for pages outside an organisation (e.g. platform administration). */
  items?: NavItem[];
  /** Shown above every page in this shell (e.g. a Platform Administrator without an organisation). */
  notice?: ReactNode;
}) {
  // Show the review queues when the user can review or approve (a display aid only).
  const showReview = canReview || canApprove;
  const waiting = useWaitingCount(organisationId, {
    review: canReview && !items,
    approve: canApprove && !items,
  });
  const nav: NavItem[] =
    items ??
    (basePath
      ? [
          {
            to: `${basePath}/facilities`,
            label: 'Facilities',
            icon: <Factory aria-hidden />,
            page: 'facilities',
            section: 'Operations',
          },
          ...(showReview
            ? [
                {
                  to: `${basePath}/review`,
                  label: 'Review',
                  icon: <ClipboardCheck aria-hidden />,
                  page: 'review' as const,
                  section: 'Operations',
                  count: waiting,
                  countLabel: waitingLabel(waiting, canReview, canApprove),
                },
              ]
            : []),
          {
            to: `${basePath}/reports`,
            label: 'Reports',
            icon: <BarChart3 aria-hidden />,
            page: 'reports',
            section: 'Accounting',
          },
          {
            to: `${basePath}/methodology`,
            label: 'Methodology',
            icon: <BookOpen aria-hidden />,
            page: 'methodology',
            section: 'Accounting',
          },
          ...(isPlatformAdmin
            ? [
                {
                  to: '/admin/methodology',
                  label: 'Methodology registry',
                  icon: <ShieldCheck aria-hidden />,
                  page: 'adminMethodology' as const,
                  section: 'Accounting',
                },
              ]
            : []),
          ...(showMembers
            ? [
                {
                  to: `${basePath}/members`,
                  label: 'Members',
                  icon: <Users aria-hidden />,
                  page: 'members' as const,
                  section: 'Organisation',
                },
              ]
            : []),
          {
            to: `${basePath}/settings`,
            label: 'Settings',
            icon: <Settings aria-hidden />,
            page: 'settings',
            section: 'Organisation',
          },
          {
            to: `${basePath}/system`,
            label: 'System status',
            icon: <Activity aria-hidden />,
            page: 'system',
            section: 'Organisation',
          },
        ]
      : []);
  const navigation = useNavigation();

  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[15.5rem_minmax(0,1fr)] print:block print:bg-white">
      {navigation.state !== 'idle' && <RouteProgress />}
      <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-b-0 print:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 md:border-b md:border-sidebar-border md:px-5 md:py-4">
          <Link
            to="/"
            className="inline-block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary"
            aria-label="Flame home"
          >
            <BrandLockup subtitle="Emissions accounting" />
          </Link>
          {/* Narrow screens: organisation and account sit opposite the brand. */}
          <div className="flex shrink-0 items-center gap-1 md:hidden">
            {organisationCompactSlot}
            <UserMenu compact />
          </div>
        </div>

        {organisationSlot && (
          <div className="hidden px-3 pt-3 pb-1 md:block">{organisationSlot}</div>
        )}

        {nav.length > 0 && (
          <nav aria-label="Main" className="px-2 pb-2 md:flex-1 md:overflow-y-auto md:px-3 md:pb-3">
            <SidebarNav items={nav} />
          </nav>
        )}

        <div className="hidden border-t border-sidebar-border p-2 md:mt-auto md:block">
          <UserMenu />
        </div>
      </aside>

      <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 md:px-10 md:py-8 print:max-w-none print:p-0">
        {notice}
        {/* Keyed by organisation so per-page state (filters, open dialogs) resets on switch. */}
        <Outlet key={basePath} />
      </main>
    </div>
  );
}

/** Sidebar links, grouped by section on wide screens and as a row of icons on narrow ones. */
function SidebarNav({ items }: { items: NavItem[] }) {
  const groups: { section: string | undefined; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }

  return (
    <ul className="flex flex-wrap justify-center gap-2 md:block md:space-y-0">
      {groups.map((group) => (
        <li key={group.section ?? group.items[0]?.to} className="contents md:block">
          {group.section && (
            <p className="eyebrow hidden px-3 pt-5 pb-2 text-[0.625rem] text-muted-light/70 md:block">
              {group.section}
            </p>
          )}
          <ul className="contents md:block md:space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <SidebarLink item={item} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const showCount = item.count !== undefined && item.count > 0;
  return (
    <NavLink
      to={item.to}
      onMouseEnter={() => {
        preloadPage(item.page);
      }}
      onFocus={() => {
        preloadPage(item.page);
      }}
      title={item.label}
      // With a count, the name is spelled out ("Review, 2 records waiting for review") rather
      // than assembled from spans, whose spacing name computation does not keep reliably.
      // It starts with the visible label, so voice control still matches it.
      aria-label={
        showCount
          ? `${item.label}, ${String(item.count)} ${item.countLabel ?? ''}`.trim()
          : undefined
      }
      className={({ isActive }) =>
        cn(
          'relative flex items-center justify-center gap-3 rounded-sm p-2.5 text-sm whitespace-nowrap transition-colors duration-150 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-primary md:justify-start md:px-3 md:py-2 [&_svg]:size-5 [&_svg]:shrink-0 md:[&_svg]:size-4',
          // Active: an elevated row and a 2 px Oxide marker on its leading edge.
          'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent max-md:before:inset-x-2 max-md:before:top-auto max-md:before:bottom-0 max-md:before:h-0.5 max-md:before:w-auto',
          isActive &&
            'bg-sidebar-accent font-medium text-sidebar-accent-foreground before:bg-sidebar-primary',
        )
      }
    >
      {item.icon}
      {/* Icons only on narrow screens; the name stays available to screen readers. */}
      <span className="sr-only md:not-sr-only">{item.label}</span>
      {showCount && (
        <span
          aria-hidden
          className="figure ml-auto rounded-xs bg-flare px-1.5 text-[0.7rem] leading-[1.15rem] font-medium text-basalt max-md:absolute max-md:-top-0.5 max-md:-right-0.5 max-md:px-1 max-md:text-[0.6rem] max-md:leading-4"
        >
          {item.count}
        </span>
      )}
    </NavLink>
  );
}

/**
 * A thin Oxide line across the top while the next page loads. It appears only after a
 * short delay, so instant navigations never flash it. Static under reduced motion.
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
