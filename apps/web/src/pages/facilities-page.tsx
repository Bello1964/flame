import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { FacilityFormDialog } from '@/features/hierarchy/facility-form';
import { NotRecorded, RecordList } from '@/features/hierarchy/record-list';

export function FacilitiesPage() {
  const organisation = useOrganisation();
  const [adding, setAdding] = useState(false);
  const base = `/o/${organisation.organisationId}`;

  const addButton = organisation.canWriteHierarchy ? (
    <Button
      onClick={() => {
        setAdding(true);
      }}
    >
      <Plus aria-hidden />
      Add facility
    </Button>
  ) : undefined;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Facilities</h1>
          <p className="text-sm text-muted-foreground">
            Sites operated by {organisation.organisationName}. Open a facility to manage its assets
            and flare sources.
          </p>
        </div>
        {addButton}
      </header>

      <RecordList
        resource="facilities"
        label="facilities"
        detailPath={(f) => `${base}/facilities/${f.id}`}
        columns={[
          { header: 'Region', cell: (f) => f.region ?? <NotRecorded />, hideOnMobile: true },
          { header: 'Country', cell: (f) => f.country, hideOnMobile: true },
        ]}
        emptyDescription={
          organisation.canWriteHierarchy
            ? 'Add your first facility to start building the operational hierarchy.'
            : 'An organisation owner or administrator can add facilities.'
        }
        emptyAction={addButton}
      />

      {adding && (
        <FacilityFormDialog
          onClose={() => {
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}
