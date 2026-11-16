import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/features/hierarchy/record-detail';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useSettings } from './api';
import { ActivityFormDialog } from './activity-form';
import { ActivityList } from './activity-list';

/** Gas activity data on a flare source's page: the list, plus recording new activity. */
export function ActivitySection({
  flareSource,
}: {
  flareSource: { id: string; name: string; status: 'ACTIVE' | 'ARCHIVED' };
}) {
  const organisation = useOrganisation();
  // The organisation's default reference condition prefills the form.
  const settings = useSettings(organisation.organisationId);
  const [adding, setAdding] = useState(false);
  const active = flareSource.status === 'ACTIVE';
  const canRecord = organisation.canWriteActivity && active;

  const addButton = canRecord ? (
    <Button
      disabled={!settings.data}
      onClick={() => {
        setAdding(true);
      }}
    >
      {settings.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
      Record activity
    </Button>
  ) : undefined;

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Gas activity"
        description="Operational quantities only: no emissions are calculated yet."
        action={addButton}
      />
      <ActivityList
        flareSourceId={flareSource.id}
        emptyAction={addButton}
        emptyDescription={
          !active
            ? 'This flare source is archived, so no new activity can be recorded.'
            : organisation.canWriteActivity
              ? 'Record daily readings or reporting-period totals for this flare source.'
              : 'A data entry officer, administrator or owner can record activity.'
        }
      />
      {adding && settings.data && (
        <ActivityFormDialog
          mode="create"
          flareSourceId={flareSource.id}
          flareSourceName={flareSource.name}
          settings={settings.data}
          onClose={() => {
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}
