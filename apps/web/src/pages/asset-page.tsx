import { useState } from 'react';
import { useParams } from 'react-router';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useHierarchyRecord } from '@/features/hierarchy/api';
import { ArchiveDialog } from '@/features/hierarchy/archive-dialog';
import { AssetFormDialog } from '@/features/hierarchy/asset-form';
import { FlareSourceFormDialog } from '@/features/hierarchy/flare-source-form';
import { NotRecorded, RecordList } from '@/features/hierarchy/record-list';
import { FLARE_TYPE_LABELS } from '@/features/hierarchy/schemas';
import {
  ArchivedNotice,
  Breadcrumbs,
  DetailList,
  InlineSkeleton,
  RecordHeader,
  RecordPageState,
  SectionHeader,
} from '@/features/hierarchy/record-detail';

export function AssetPage() {
  const { assetId } = useParams();
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const base = `/o/${orgId}`;
  const asset = useHierarchyRecord(orgId, 'assets', assetId);
  const facility = useHierarchyRecord(orgId, 'facilities', asset.data?.facilityId);
  const [dialog, setDialog] = useState<'edit' | 'add-flare-source' | null>(null);

  if (!asset.data) {
    return (
      <RecordPageState
        error={asset.error}
        label="asset"
        backTo={`${base}/facilities`}
        backLabel="Back to facilities"
        onRetry={() => void asset.refetch()}
      />
    );
  }

  const a = asset.data;
  const active = a.status === 'ACTIVE';
  const canWrite = organisation.canWriteHierarchy && active;
  const facilityPath = `${base}/facilities/${a.facilityId}`;
  const facilityName = facility.data?.name ?? (facility.isError ? 'Facility' : null);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Facilities', to: `${base}/facilities` },
            { label: facilityName, to: facilityPath },
            { label: a.name },
          ]}
        />
        <RecordHeader
          kind="Asset"
          name={a.name}
          code={a.code}
          status={a.status}
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
                <ArchiveDialog resource="assets" id={a.id} name={a.name} label="asset" />
              </>
            )
          }
        />
        {!active && <ArchivedNotice label="asset" archivedAt={a.archivedAt} />}
        <DetailList
          items={[
            { label: 'Facility', value: facilityName ?? <InlineSkeleton /> },
            { label: 'Asset type', value: a.assetType },
            { label: 'Description', value: a.description },
          ]}
          timestamps={a}
        />
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Flare sources"
          description="Flare stacks or tips on this asset. Gas activity data will be recorded against these."
          action={
            canWrite && (
              <Button
                onClick={() => {
                  setDialog('add-flare-source');
                }}
              >
                <Plus aria-hidden />
                Add flare source
              </Button>
            )
          }
        />
        <RecordList
          resource="flare-sources"
          label="flare sources"
          parentFilter={{ assetId: a.id }}
          detailPath={(s) => `${base}/flare-sources/${s.id}`}
          columns={[
            {
              header: 'Flare type',
              cell: (s) => (s.flareType ? FLARE_TYPE_LABELS[s.flareType] : <NotRecorded />),
            },
          ]}
          emptyDescription={
            !active
              ? 'This asset is archived, so flare sources can’t be added.'
              : organisation.canWriteHierarchy
                ? 'Add each flare stack or tip on this asset.'
                : 'An organisation owner or administrator can add flare sources.'
          }
        />
      </section>

      {dialog === 'edit' && (
        <AssetFormDialog
          mode="edit"
          record={a}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'add-flare-source' && (
        <FlareSourceFormDialog
          mode="create"
          assetId={a.id}
          assetName={a.name}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
