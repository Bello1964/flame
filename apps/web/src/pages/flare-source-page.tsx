import { useState } from 'react';
import { useParams } from 'react-router';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useHierarchyRecord } from '@/features/hierarchy/api';
import { ArchiveDialog } from '@/features/hierarchy/archive-dialog';
import { FlareSourceFormDialog } from '@/features/hierarchy/flare-source-form';
import { FLARE_SERVICE_LABELS, FLARE_TYPE_LABELS } from '@/features/hierarchy/schemas';
import { ActivitySection } from '@/features/activity/activity-section';
import { CalculationInputsSection } from '@/features/calculations/inputs-section';
import {
  ArchivedNotice,
  Breadcrumbs,
  DetailList,
  InlineSkeleton,
  RecordHeader,
  RecordPageState,
} from '@/features/hierarchy/record-detail';

export function FlareSourcePage() {
  const { flareSourceId } = useParams();
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const base = `/o/${orgId}`;
  const source = useHierarchyRecord(orgId, 'flare-sources', flareSourceId);
  const asset = useHierarchyRecord(orgId, 'assets', source.data?.assetId);
  const facility = useHierarchyRecord(orgId, 'facilities', asset.data?.facilityId);
  const [editing, setEditing] = useState(false);

  if (!source.data) {
    return (
      <RecordPageState
        error={source.error}
        label="flare source"
        backTo={`${base}/facilities`}
        backLabel="Back to facilities"
        onRetry={() => void source.refetch()}
      />
    );
  }

  const s = source.data;
  const active = s.status === 'ACTIVE';
  const canWrite = organisation.canWriteHierarchy && active;
  const assetName = asset.data?.name ?? (asset.isError ? 'Asset' : null);
  const facilityName =
    facility.data?.name ?? (facility.isError || asset.isError ? 'Facility' : null);

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Facilities', to: `${base}/facilities` },
          {
            label: facilityName,
            ...(asset.data ? { to: `${base}/facilities/${asset.data.facilityId}` } : {}),
          },
          { label: assetName, to: `${base}/assets/${s.assetId}` },
          { label: s.name },
        ]}
      />
      <RecordHeader
        kind="Flare source"
        name={s.name}
        code={s.code}
        status={s.status}
        actions={
          canWrite && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden />
                Edit
              </Button>
              <ArchiveDialog
                resource="flare-sources"
                id={s.id}
                name={s.name}
                label="flare source"
              />
            </>
          )
        }
      />
      {!active && <ArchivedNotice label="flare source" archivedAt={s.archivedAt} />}
      <DetailList
        items={[
          { label: 'Facility', value: facilityName ?? <InlineSkeleton /> },
          { label: 'Asset', value: assetName ?? <InlineSkeleton /> },
          { label: 'Flare type', value: s.flareType ? FLARE_TYPE_LABELS[s.flareType] : null },
          {
            label: 'Flare service',
            value: s.flareService ? FLARE_SERVICE_LABELS[s.flareService] : null,
          },
          { label: 'Description', value: s.description },
        ]}
        timestamps={s}
      />
      <div className="pt-4">
        <ActivitySection flareSource={s} />
      </div>
      <div className="pt-4">
        <CalculationInputsSection flareSource={s} />
      </div>

      {editing && (
        <FlareSourceFormDialog
          mode="edit"
          record={s}
          onClose={() => {
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
