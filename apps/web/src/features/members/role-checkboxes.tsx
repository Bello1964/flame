import { useId } from 'react';
import { ROLES, type Role } from '@flame/shared';
import { ROLE_LABELS } from '@/features/organisations/permissions';

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ORGANISATION_OWNER: 'Everything, including granting the Owner role and releasing review claims.',
  ADMINISTRATOR:
    'Facilities, activity data, calculations, settings and members. Not review or approval.',
  APPROVER: 'Approves or rejects reviewed activity data and calculations.',
  REVIEWER: 'Reviews submitted activity data and calculations.',
  DATA_ENTRY_OFFICER: 'Enters and submits activity data and runs calculations.',
  VIEWER: 'Reads facilities, activity data, calculations and reports.',
};

/**
 * One checkbox per role. Only an Owner may grant the Owner role, so for anyone else the
 * Owner box is locked unless it is already ticked (taking the role away is allowed).
 */
export function RoleCheckboxes({
  value,
  onChange,
  canGrantOwner,
  initiallyOwner = false,
  error,
  disabled = false,
}: {
  value: readonly Role[];
  onChange: (roles: Role[]) => void;
  canGrantOwner: boolean;
  /** The person already holds the Owner role (so a non-Owner may still remove it). */
  initiallyOwner?: boolean;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const ownerLocked = !canGrantOwner && !initiallyOwner;

  return (
    <fieldset
      className="grid gap-2"
      aria-describedby={errorId}
      aria-invalid={Boolean(error)}
      disabled={disabled}
    >
      <legend className="mb-1 text-sm font-medium">
        Roles
        <span className="text-destructive" aria-hidden>
          *
        </span>
      </legend>
      <p className="text-xs text-muted-foreground">
        Roles combine: choose every role this person needs.
      </p>
      <ul className="grid gap-1.5">
        {ROLES.map((role) => {
          const checked = value.includes(role);
          const locked = role === 'ORGANISATION_OWNER' && ownerLocked;
          const boxId = `${id}-${role}`;
          const hintId = `${boxId}-hint`;
          return (
            <li key={role} className="flex items-start gap-2.5 rounded-md border px-3 py-2">
              <input
                id={boxId}
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary disabled:cursor-not-allowed"
                checked={checked}
                disabled={locked}
                aria-describedby={hintId}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...value, role]
                    : value.filter((r) => r !== role);
                  onChange(ROLES.filter((r) => next.includes(r)));
                }}
              />
              <label htmlFor={boxId} className="grid gap-0.5 text-sm">
                <span className={locked ? 'text-muted-foreground' : 'font-medium'}>
                  {ROLE_LABELS[role]}
                </span>
                <span id={hintId} className="text-xs text-muted-foreground">
                  {locked ? 'Only an Owner can grant the Owner role.' : ROLE_DESCRIPTIONS[role]}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
