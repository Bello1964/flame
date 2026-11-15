import { createContext, use, useMemo, type ReactNode } from 'react';
import type { MembershipSummary } from '@carbon/shared';
import { canManageSettings, canWriteActivity, canWriteHierarchy } from './permissions';

export interface ActiveOrganisation extends MembershipSummary {
  /** Display hint only; the API enforces the permission. */
  canWriteHierarchy: boolean;
  /** Display hint only; the API enforces the permission. */
  canWriteActivity: boolean;
  /** Display hint only; the API enforces the permission. */
  canManageSettings: boolean;
}

const OrganisationContext = createContext<ActiveOrganisation | null>(null);

export function OrganisationProvider({
  membership,
  children,
}: {
  membership: MembershipSummary;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      ...membership,
      canWriteHierarchy: canWriteHierarchy(membership.roles),
      canWriteActivity: canWriteActivity(membership.roles),
      canManageSettings: canManageSettings(membership.roles),
    }),
    [membership],
  );
  return <OrganisationContext value={value}>{children}</OrganisationContext>;
}

/** The organisation in the current URL. Only valid beneath an organisation route. */
// eslint-disable-next-line react-refresh/only-export-components -- hook paired with its provider
export function useOrganisation(): ActiveOrganisation {
  const organisation = use(OrganisationContext);
  if (!organisation) throw new Error('useOrganisation must be used beneath <OrganisationProvider>');
  return organisation;
}
