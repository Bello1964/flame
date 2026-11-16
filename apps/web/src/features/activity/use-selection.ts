import { useMemo, useState } from 'react';
import { BULK_ACTIVITY_ACTIONS, type ActivityRecordDto } from '@flame/shared';

/** Row selection for one page of records; ids of rows no longer shown are dropped. */
export function useSelection(rows: ActivityRecordDto[]) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const selected = useMemo(() => rows.filter((r) => ids.has(r.id)), [rows, ids]);
  const selectable = rows.filter((r) =>
    BULK_ACTIVITY_ACTIONS.some((a) => r.availableActions.includes(a)),
  );
  return {
    selected,
    selectable,
    isSelected: (id: string) => ids.has(id),
    toggle: (id: string) => {
      setIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    setAll: (on: boolean) => {
      setIds(on ? new Set(selectable.map((r) => r.id)) : new Set());
    },
    clear: () => {
      setIds(new Set());
    },
  };
}

export type Selection = ReturnType<typeof useSelection>;
