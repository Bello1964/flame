import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { AlertTriangle, Ban, Info, Pencil } from 'lucide-react';
import {
  PRESSURE_UNIT_LABELS,
  RATE_UNIT_LABELS,
  TEMPERATURE_UNIT_LABELS,
  VOLUME_UNIT_LABELS,
  type ActivityRecordDto,
} from '@flame/shared';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime, formatDecimal } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useHierarchyRecord } from '@/features/hierarchy/api';
import {
  Breadcrumbs,
  DetailList,
  RecordPageState,
  SectionHeader,
} from '@/features/hierarchy/record-detail';
import { useActivityRecord, useSettings } from '@/features/activity/api';
import { ActivityFormDialog } from '@/features/activity/activity-form';
import { ActivityStatusBadge, ActivityTypeBadge } from '@/features/activity/badges';
import { WithdrawDialog } from '@/features/activity/withdraw-dialog';
import {
  ACTIVITY_TYPE_LABELS,
  BASIS_LABELS,
  METHOD_LABELS,
  periodLabel,
} from '@/features/activity/labels';

function Entered({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="tabular-nums">
      {value}
      {unit && <span className="text-muted-foreground"> {unit}</span>}
    </span>
  );
}

/** A standardised value: rounded for reading, with the exact stored value on hover. */
function Standard({ value, unit }: { value: string | null; unit: string }) {
  if (value === null) return null;
  return (
    <span className="tabular-nums" title={`Exact: ${value} ${unit}`}>
      {formatDecimal(value)} <span className="text-muted-foreground">{unit}</span>
    </span>
  );
}

function Warnings({ record }: { record: ActivityRecordDto }) {
  if (record.warnings.length === 0) return null;
  return (
    <section aria-labelledby="warnings-heading" className="space-y-2">
      <h2 id="warnings-heading" className="text-sm font-semibold">
        Data-quality warnings
      </h2>
      <ul className="space-y-2">
        {record.warnings.map((w) => (
          <li
            key={w.code}
            className={
              w.code === 'NO_EVIDENCE'
                ? 'flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground'
                : 'flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm'
            }
          >
            {w.code === 'NO_EVIDENCE' ? (
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            )}
            <span>
              {w.message}
              {w.overlapping && (
                <span className="block text-muted-foreground">
                  {w.overlapping
                    .map((o) =>
                      o.periodStart === o.periodEnd
                        ? formatDate(o.periodStart)
                        : `${formatDate(o.periodStart)} – ${formatDate(o.periodEnd)}`,
                    )
                    .join('; ')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} {...(description ? { description } : {})} />
      {children}
    </section>
  );
}

export function ActivityRecordPage() {
  const { recordId } = useParams();
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const base = `/o/${orgId}`;
  const record = useActivityRecord(orgId, recordId);
  const source = useHierarchyRecord(orgId, 'flare-sources', record.data?.flareSourceId);
  const asset = useHierarchyRecord(orgId, 'assets', source.data?.assetId);
  const facility = useHierarchyRecord(orgId, 'facilities', asset.data?.facilityId);
  const settings = useSettings(orgId);
  const [editing, setEditing] = useState(false);

  if (!record.data) {
    return (
      <RecordPageState
        error={record.error}
        label="activity record"
        backTo={`${base}/facilities`}
        backLabel="Back to facilities"
        onRetry={() => void record.refetch()}
      />
    );
  }

  const r = record.data;
  const draft = r.status === 'DRAFT';
  const sourceActive = source.data?.status === 'ACTIVE';
  const canEdit = organisation.canWriteActivity && draft && sourceActive;
  const canWithdraw = organisation.canWriteActivity && draft;
  const s = r.standardised;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Facilities', to: `${base}/facilities` },
            {
              label: facility.data?.name ?? null,
              ...(asset.data ? { to: `${base}/facilities/${asset.data.facilityId}` } : {}),
            },
            {
              label: asset.data?.name ?? null,
              ...(source.data ? { to: `${base}/assets/${source.data.assetId}` } : {}),
            },
            { label: source.data?.name ?? null, to: `${base}/flare-sources/${r.flareSourceId}` },
            { label: periodLabel(r) },
          ]}
        />
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {r.kind === 'DAILY' ? 'Daily activity record' : 'Reporting-period activity record'}
            </p>
            <h1 className="text-2xl font-semibold">{periodLabel(r)}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <ActivityTypeBadge type={r.activityType} />
              <ActivityStatusBadge status={r.status} />
              <span className="text-xs text-muted-foreground">Dates in {r.timeZone}</span>
            </div>
          </div>
          {(canEdit || canWithdraw) && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {canEdit && (
                <Button
                  variant="outline"
                  disabled={!settings.data}
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  <Pencil aria-hidden />
                  Edit
                </Button>
              )}
              {canWithdraw && <WithdrawDialog recordId={r.id} />}
            </div>
          )}
        </header>

        {r.withdrawal && (
          <p className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Withdrawn {formatDateTime(r.withdrawal.at)}: “{r.withdrawal.reason}”. Kept for
              history; read-only.
            </span>
          </p>
        )}
        {draft && !sourceActive && source.data && (
          <p className="text-sm text-muted-foreground">
            The flare source is archived, so this record can no longer be edited.
          </p>
        )}
        <Warnings record={r} />
      </div>

      <Panel title="As entered" description="Values exactly as they were typed, with their units.">
        <DetailList
          items={[
            {
              label: 'Activity type',
              value:
                r.activityType === 'OTHER_RELEASE'
                  ? `${ACTIVITY_TYPE_LABELS[r.activityType]}: ${r.otherTypeDescription ?? ''}`
                  : ACTIVITY_TYPE_LABELS[r.activityType],
            },
            {
              label: 'Average rate',
              value: r.averageRate && (
                <Entered
                  value={r.averageRate.entered}
                  unit={RATE_UNIT_LABELS[r.averageRate.unit]}
                />
              ),
            },
            {
              label: 'Total volume',
              value: r.totalVolume && (
                <Entered
                  value={r.totalVolume.entered}
                  unit={VOLUME_UNIT_LABELS[r.totalVolume.unit]}
                />
              ),
            },
            {
              label: 'Actual operating hours',
              value: r.operatingHours && <Entered value={r.operatingHours.entered} unit="h" />,
            },
            { label: 'Measured or estimated', value: BASIS_LABELS[r.measurementBasis] },
            ...(r.estimateExplanation
              ? [{ label: 'How it was estimated', value: r.estimateExplanation }]
              : []),
            {
              label: 'Measurement method',
              value:
                r.measurementMethod === 'OTHER'
                  ? `Other: ${r.methodDescription ?? ''}`
                  : METHOD_LABELS[r.measurementMethod],
            },
            { label: 'Data source', value: 'Manual entry' },
            { label: 'Notes', value: r.notes },
          ]}
        />
      </Panel>

      <Panel
        title="Reference condition"
        description="The condition the entered quantities are expressed at."
      >
        <DetailList
          items={[
            {
              label: 'Temperature',
              value: (
                <Entered
                  value={r.referenceTemperature.entered}
                  unit={TEMPERATURE_UNIT_LABELS[r.referenceTemperature.unit]}
                />
              ),
            },
            {
              label: 'Absolute pressure',
              value: (
                <Entered
                  value={r.referencePressure.entered}
                  unit={PRESSURE_UNIT_LABELS[r.referencePressure.unit]}
                />
              ),
            },
            {
              label: 'Z at this condition',
              value: r.zSource ? (
                <Entered value={r.zSource.entered} />
              ) : (
                'Not applicable (platform standard)'
              ),
            },
            {
              label: 'Z at 15 °C, 101.325 kPa',
              value: r.zReference ? (
                <Entered value={r.zReference.entered} />
              ) : (
                'Not applicable (platform standard)'
              ),
            },
            ...(r.zSource
              ? [{ label: 'Source of the Z values', value: r.compressibilitySource }]
              : []),
          ]}
        />
      </Panel>

      <Panel
        title={`Standardised to ${s.referenceCondition}`}
        description="Calculated by the server when the record was saved. Hover a value to see it in full."
      >
        <DetailList
          items={[
            {
              label: 'Average rate',
              value: s.averageRateMmscfd !== null && (
                <Standard value={s.averageRateMmscfd} unit="MMscf/d" />
              ),
            },
            {
              label: 'Total volume',
              value: s.totalVolumeMmscf !== null && (
                <Standard value={s.totalVolumeMmscf} unit="MMscf" />
              ),
            },
            {
              label: 'Derived volume (rate × hours ÷ 24)',
              value:
                s.derivedVolumeMmscf !== null ? (
                  <Standard value={s.derivedVolumeMmscf} unit="MMscf" />
                ) : (
                  'Not derived: needs a rate and actual operating hours'
                ),
            },
            {
              label: 'Correction factor',
              value: (
                <span title={`Exact: ${s.correctionFactor}`}>
                  {formatDecimal(s.correctionFactor, 10)}
                </span>
              ),
            },
            { label: 'Conversion', value: s.conversionVersion },
            { label: 'Standardised', value: formatDateTime(s.standardisedAt) },
          ].map((item) => ({ ...item, value: item.value === false ? null : item.value }))}
        />
      </Panel>

      <Panel title="History">
        <DetailList
          items={[
            ...(r.overlapAcknowledgedAt
              ? [{ label: 'Overlap confirmed', value: formatDateTime(r.overlapAcknowledgedAt) }]
              : []),
          ]}
          timestamps={r}
        />
      </Panel>

      {editing && settings.data && (
        <ActivityFormDialog
          mode="edit"
          record={r}
          settings={settings.data}
          onClose={() => {
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
