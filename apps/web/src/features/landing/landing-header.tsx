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
import { useLogout, useSession } from '@/features/auth/session';

const NAV = [
  { href: '#platform', label: 'Platform' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#integrity', label: 'Integrity' },
  { href: '#roadmap', label: 'Roadmap' },
];

/** The signed-in visitor's way back into the app, plus sign out. */
function AccountActions() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  if (session.isPending) {
    return <Skeleton aria-label="Checking your session" className="h-9 w-32 bg-mint/10" />;
  }
  const data = session.data;
  if (!data) {
    return (
      <Button asChild className="bg-mint text-forest hover:bg-mint/90">
        <Link to="/login">Sign in</Link>
      </Button>
    );
  }

  const first = data.memberships[0];
  return (
    <div className="flex items-center gap-2">
      <Button asChild className="bg-mint text-forest hover:bg-mint/90">
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
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-mint/90 outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-mint/40"
          aria-label={`Account: ${data.user.name}`}
          disabled={logout.isPending}
        >
          <span
            className="flex size-7 items-center justify-center rounded-full bg-mint/15 text-xs font-semibold text-mint"
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

export function LandingHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 md:px-8">
        <Link
          to="/"
          className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-mint/40"
          aria-label="Flame home"
        >
          <BrandLockup />
        </Link>
        <nav aria-label="Sections" className="max-md:hidden">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm text-mint/75 transition-colors outline-none hover:text-mint focus-visible:ring-[3px] focus-visible:ring-mint/40"
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
