import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowRight, ChevronDown, LogOut } from 'lucide-react';
import { BrandLockup } from '@/components/brand';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useLogout, useSession } from '@/features/auth/session';
import { WRAP } from './styles';

const NAV = [
  { href: '#platform', label: 'Platform' },
  { href: '#workflow', label: 'How it works' },
  { href: '#integrity', label: 'Integrity' },
  { href: '#reporting', label: 'Reporting' },
  { href: '#questions', label: 'Questions' },
];

const ON_DARK_FOCUS =
  'outline-none focus-visible:ring-2 focus-visible:ring-oxide-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-basalt';

/** The signed-in visitor's way back into the app, plus sign out. */
function AccountActions() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  if (session.isPending) {
    return <Skeleton aria-label="Checking your session" className="h-9 w-28 bg-elevated" />;
  }
  const data = session.data;
  if (!data) {
    return (
      <Button
        asChild
        variant="outline"
        className={cn(
          'rounded-sm border-limestone/35 bg-transparent text-limestone hover:bg-limestone/8 hover:text-limestone',
          ON_DARK_FOCUS,
        )}
      >
        <Link to="/login">Sign in</Link>
      </Button>
    );
  }

  const first = data.memberships[0];
  return (
    <div className="flex items-center gap-2">
      <Button asChild className={cn('rounded-sm', ON_DARK_FOCUS)}>
        <Link to="/app">
          <span className="max-sm:hidden">
            {first ? `Open ${first.organisationName}` : 'Open Flame'}
          </span>
          <span className="sm:hidden">Open</span>
          <ArrowRight aria-hidden />
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-limestone hover:bg-elevated',
            ON_DARK_FOCUS,
          )}
          aria-label={`Account: ${data.user.name}`}
          disabled={logout.isPending}
        >
          <span
            className="flex size-7 items-center justify-center rounded-full bg-elevated text-xs font-semibold text-limestone ring-1 ring-dark-line"
            aria-hidden
          >
            {data.user.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <ChevronDown className="size-4 opacity-70" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="truncate">{data.user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {data.memberships.map((m) => (
            <DropdownMenuItem
              key={m.organisationId}
              onSelect={() => {
                void navigate(`/o/${m.organisationId}/facilities`);
              }}
            >
              <span className="truncate">{m.organisationName}</span>
            </DropdownMenuItem>
          ))}
          {data.memberships.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onSelect={() => {
              logout.mutate(false, {
                onSuccess: () => {
                  toast.success('Signed out.');
                },
                onError: (error) => {
                  toast.error(`Could not sign out. ${errorMessage(error)}`);
                },
              });
            }}
          >
            <LogOut aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Sits over the hero's Basalt: the lockup, section anchors and account actions. */
export function LandingHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div
        className={cn(
          WRAP,
          'flex h-[4.75rem] items-center justify-between gap-4 border-b border-limestone/12',
        )}
      >
        <Link to="/" className={cn('rounded-sm', ON_DARK_FOCUS)} aria-label="Flame home">
          <BrandLockup />
        </Link>
        <nav aria-label="Sections" className="max-lg:hidden">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={cn(
                    'rounded-sm px-3 py-2 text-sm text-muted-light transition-colors hover:text-limestone',
                    ON_DARK_FOCUS,
                  )}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <AccountActions />
      </div>
    </header>
  );
}
