import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import {
  BULK_ACTIVITY_ACTIONS,
  type ActivityRecordDto,
  type BulkActivityAction,
  type BulkActivityResult,
} from '@flame/shared';
import { Button } from '@/components/ui/button';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useBulkActivityAction } from './api';
import { periodLabel } from './labels';
import { ActionDialog, ActionError } from './workflow-actions';
import { ACTION_CONFIG } from './workflow-config';
import type { Selection } from './use-selection';

const CHECKBOX = 'size-4 cursor-pointer rounded accent-primary disabled:cursor-not-allowed';

export function SelectAllCheckbox({ selection }: { selection: Selection }) {
  const total = selection.selectable.length;
  const count = selection.selected.length;
  if (total === 0) return null;
  return (
    <input
      type="checkbox"
      className={CHECKBOX}
      aria-label="Select all records on this page that you can act on"
      checked={count > 0 && count === total}
      ref={(el) => {
        if (el) el.indeterminate = count > 0 && count < total;
      }}
      onChange={(e) => {
        selection.setAll(e.target.checked);
      }}
    />
  );
}

export function SelectRowCheckbox({
  selection,
  record,
}: {
  selection: Selection;
  record: ActivityRecordDto;
}) {
  const actionable = selection.selectable.some((r) => r.id === record.id);
  if (!actionable) return null;
  return (
    <input
      type="checkbox"
      className={CHECKBOX}
      aria-label={`Select record ${periodLabel(record)}`}
      checked={selection.isSelected(record.id)}
      onChange={() => {
        selection.toggle(record.id);
      }}
    />
  );
}

/**
 * Actions for the selected records. Each action is offered for the records whose
 * `availableActions` include it (as the API reported them); the API decides again for
 * each record, and the result says what happened to every one.
 */
export function BulkActionBar({ selection }: { selection: Selection }) {
  const { organisationId } = useOrganisation();
  const bulk = useBulkActivityAction(organisationId);
  const [dialog, setDialog] = useState<BulkActivityAction | null>(null);
  const [failures, setFailures] = useState<{ label: string; message: string }[]>([]);

  const selected = selection.selected;
  if (selected.length === 0 && failures.length === 0) return null;

  const targets = (action: BulkActivityAction) =>
    selected.filter((r) => r.availableActions.includes(action));
  const offered = BULK_ACTIVITY_ACTIONS.filter((a) => targets(a).length > 0);

  const run = (action: BulkActivityAction, comment?: string) => {
    const records = targets(action);
    setFailures([]);
    bulk.mutate(
      { action, ids: records.map((r) => r.id), ...(comment ? { comment } : {}) },
      {
        onSuccess: (results: BulkActivityResult[]) => {
          setDialog(null);
          const ok = results.filter((r) => r.ok).length;
          const failed = results.flatMap((r) => {
            if (r.ok) return [];
            const record = records.find((x) => x.id === r.id);
            return [{ label: record ? periodLabel(record) : r.id, message: r.error.message }];
          });
          if (ok > 0) {
            toast.success(
              `${ACTION_CONFIG[action].label}: ${String(ok)} record${ok === 1 ? '' : 's'} done.`,
            );
          }
          setFailures(failed);
          selection.clear();
        },
      },
    );
  };

  return (
    <div
      role="region"
      aria-label="Actions for selected records"
      className="space-y-2 rounded-md border border-primary/30 bg-accent/40 p-3"
    >
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" aria-live="polite">
            {selected.length} selected
          </span>
          {offered.map((action) => {
            const config = ACTION_CONFIG[action];
            const Icon = config.icon;
            const n = targets(action).length;
            return (
              <Button
                key={action}
                size="sm"
                variant={config.tone === 'primary' ? 'default' : 'outline'}
                className={
                  config.tone === 'destructive'
                    ? 'text-destructive hover:text-destructive'
                    : undefined
                }
                disabled={bulk.isPending}
                onClick={() => {
                  bulk.reset();
                  if (config.dialog) setDialog(action);
                  else run(action);
                }}
              >
                {bulk.isPending && bulk.variables.action === action && !config.dialog ? (
                  <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Icon aria-hidden />
                )}
                {config.label}
                {n !== selected.length && ` (${String(n)})`}
              </Button>
            );
          })}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              selection.clear();
            }}
          >
            <X aria-hidden />
            Clear selection
          </Button>
        </div>
      )}
      {dialog === null && bulk.isError && <ActionError error={bulk.error} />}
      {failures.length > 0 && (
        <div role="alert" className="text-sm">
          <p className="font-medium text-destructive">
            {failures.length} record{failures.length === 1 ? '' : 's'} could not be updated:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {failures.map((f) => (
              <li key={f.label + f.message}>
                <span className="font-medium">{f.label}</span>: {f.message}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1"
            onClick={() => {
              setFailures([]);
            }}
          >
            Dismiss
          </Button>
        </div>
      )}
      {dialog !== null && (
        <ActionDialog
          action={dialog}
          count={targets(dialog).length}
          pending={bulk.isPending}
          error={bulk.error}
          onCancel={() => {
            setDialog(null);
          }}
          onConfirm={(comment) => {
            run(dialog, comment);
          }}
        />
      )}
    </div>
  );
}
