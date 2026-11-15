import { useState } from 'react';
import { useParams } from 'react-router';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useHierarchyRecord } from '@/features/hierarchy/api';
import { ArchiveDialog } from '@/features/hierarchy/archive-dialog';
import { AssetFormDialog } from '@/features/hierarchy/asset-form';
import { FacilityFormDialog } from '@/features/hierarchy/facility-form';
import { NotRecorded, RecordList } from '@/features/hierarchy/record-list';
import {
  ArchivedNotice,
  Breadcrumbs,
  DetailList,
  RecordHeader,
  RecordPageState,
  SectionHeader,
} from '@/features/hierarchy/record-detail';

export function FacilityPage() {
  const { facilityId } = useParams();
  const organisation = useOrganisation();
  const base = `/o/${organisation.organisationId}`;
  const facility = useHierarchyRecord(organisation.organisationId, 'facilities', facilityId);
  const [dialog, setDialog] = useState<'edit' | 'add-asset' | null>(null);

  if (!facility.data) {
    return (
      <RecordPageState
        error={facility.error}
        label="facility"
        backTo={`${base}/facilities`}
        backLabel="Back to facilities"
        onRetry={() => void facility.refetch()}
      />
    );
  }

  const f = facility.data;
  const active = f.status === 'ACTIVE';
  const canWrite = organisation.canWriteHierarchy && active;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Breadcrumbs
          items={[{ label: 'Facilities', to: `${base}/facilities` }, { label: f.name }]}
        />
        <RecordHeader
          kind="Facility"
          name={f.name}
          code={f.code}
          status={f.status}
          actions={
            canWrite && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialog('edit');
                  }}
                >
                  <Pencil aria-hidden />
                  Edit
                </Button>
                <ArchiveDialog resource="facilities" id={f.id} name={f.name} label="facility" />
              </>
            )
          }
        />
        {!active && <ArchivedNotice label="facility" archivedAt={f.archivedAt} />}
        <DetailList
          items={[
            { label: 'Region or state', value: f.region },
            { label: 'Country', value: f.country },
            { label: 'Time zone', value: f.timeZone },
            {
              label: 'Coordinates',
              value:
                f.latitude !== null && f.longitude !== null ? (
                  <span className="tabular-nums">
                    {f.latitude}, {f.longitude}
                  </span>
                ) : f.latitude !== null || f.longitude !== null ? (
                  <span className="tabular-nums">
                    {f.latitude ?? <NotRecorded />}, {f.longitude ?? <NotRecorded />}
                  </span>
                ) : null,
            },
            { label: 'Description', value: f.description },
          ]}
          timestamps={f}
        />
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Assets"
          description="Equipment at this facility. Flare sources are managed per asset."
          action={
            canWrite && (
              <Button
                onClick={() => {
                  setDialog('add-asset');
                }}
              >
                <Plus aria-hidden />
                Add asset
              </Button>
            )
          }
        />
        <RecordList
          resource="assets"
          label="assets"
          parentFilter={{ facilityId: f.id }}
          detailPath={(a) => `${base}/assets/${a.id}`}
          columns={[{ header: 'Type', cell: (a) => a.assetType ?? <NotRecorded /> }]}
          emptyDescription={
            !active
              ? 'This facility is archived, so assets can’t be added.'
              : organisation.canWriteHierarchy
                ? 'Add the equipment at this facility that has flare sources.'
                : 'An organisation owner or administrator can add assets.'
          }
        />
      </section>

      {dialog === 'edit' && (
        <FacilityFormDialog
          record={f}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'add-asset' && (
        <AssetFormDialog
          mode="create"
          facilityId={f.id}
          facilityName={f.name}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
