import { useNavigate } from 'react-router';
import { Building2, ChevronsUpDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentSession } from '@/features/auth/require-auth';
import { useOrganisation } from './organisation-context';
import { ROLE_LABELS } from './permissions';

/**
 * Shows the active organisation and switches between the user's memberships.
 * Switching changes the URL; all organisation data is cached per organisation ID,
 * so no records from the previous organisation are shown.
 */
export function OrganisationSwitcher() {
  const { memberships } = useCurrentSession();
  const organisation = useOrganisation();
  const navigate = useNavigate();
  const roles = organisation.roles.map((r) => ROLE_LABELS[r]).join(', ');

  const summary = (
    <span className="flex min-w-0 flex-1 flex-col text-left">
      <span className="truncate text-sm font-medium">{organisation.organisationName}</span>
      <span className="truncate text-xs opacity-70">{roles}</span>
    </span>
  );

  if (memberships.length < 2) {
    return (
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
        <Building2 className="size-4 shrink-0 opacity-70" aria-hidden />
        {summary}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-sidebar-primary/50"
        aria-label={`Organisation: ${organisation.organisationName}. Switch organisation`}
      >
        <Building2 className="size-4 shrink-0 opacity-70" aria-hidden />
        {summary}
        <ChevronsUpDown className="size-4 shrink-0 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
      >
        <DropdownMenuLabel>Organisations</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={organisation.organisationId}
          onValueChange={(id) => {
            if (id !== organisation.organisationId) void navigate(`/o/${id}/facilities`);
          }}
        >
          {memberships.map((m) => (
            <DropdownMenuRadioItem key={m.organisationId} value={m.organisationId}>
              <span className="truncate">{m.organisationName}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
