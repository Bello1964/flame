import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ChevronsUpDown, LogOut, MonitorSmartphone, UserRound } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiError, errorMessage } from '@/lib/api-client';
import { useCurrentSession } from './require-auth';
import { useLogout } from './session';

/** The account menu. `compact`: an avatar-only button for the narrow top bar. */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user } = useCurrentSession();
  const logout = useLogout();
  const navigate = useNavigate();

  const signOut = (everywhere: boolean) => {
    logout.mutate(everywhere, {
      onSuccess: () => {
        if (everywhere) toast.success('Signed out on all devices.');
        void navigate('/login', { replace: true });
      },
      onError: (error) => {
        // 401: the session had already ended; the app has already returned to sign-in.
        if (error instanceof ApiError && error.status === 401) return;
        toast.error(`Could not sign out. ${errorMessage(error)}`);
      },
    });
  };

  const initial = (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground"
      aria-hidden
    >
      {user.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );

  return (
    <DropdownMenu>
      {compact ? (
        <DropdownMenuTrigger
          className="flex size-9 items-center justify-center rounded-full outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-sidebar-primary/50 disabled:opacity-60"
          disabled={logout.isPending}
          aria-label={`Account: ${user.name}`}
          title={user.name}
        >
          {initial}
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-sidebar-primary/50 disabled:opacity-60"
          disabled={logout.isPending}
          aria-label={`Account: ${user.name}`}
        >
          {initial}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs opacity-70">{user.email}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-70" aria-hidden />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end" side={compact ? 'bottom' : 'top'} className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void navigate('/account');
          }}
        >
          <UserRound aria-hidden />
          Your account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            signOut(false);
          }}
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            signOut(true);
          }}
        >
          <MonitorSmartphone aria-hidden />
          Sign out on all devices
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
