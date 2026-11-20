import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  FACILITY_SEGMENTS,
  FACILITY_SEGMENT_LABELS,
  FACILITY_TERRAINS,
  NUPRC_FACILITY_TYPES,
  NUPRC_FACILITY_TYPE_LABELS,
  type FacilityDto,
} from '@flame/shared';
import { NativeSelect } from '@/components/ui/native-select';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useCreateRecord, useUpdateRecord } from './api';
import { RecordFormDialog } from './record-form-dialog';
import { applyServerError } from './server-errors';
import {
  NOT_RECORDED,
  changedFields,
  facilityFormSchema,
  toApi,
  type FacilityFormValues,
} from './schemas';

const FIELDS = [
  'name',
  'code',
  'description',
  'region',
  'country',
  'latitude',
  'longitude',
  'timeZone',
  'terrain',
  'concession',
  'fieldName',
  'facilityType',
  'segment',
] as const satisfies readonly (keyof FacilityFormValues)[];

function defaultsFrom(record?: FacilityDto): FacilityFormValues {
  return {
    name: record?.name ?? '',
    code: record?.code ?? '',
    description: record?.description ?? '',
    region: record?.region ?? '',
    country: record?.country ?? 'NG',
    latitude: record?.latitude ?? '',
    longitude: record?.longitude ?? '',
    timeZone: record?.timeZone ?? 'Africa/Lagos',
    terrain: record?.terrain ?? NOT_RECORDED,
    concession: record?.concession ?? '',
    fieldName: record?.fieldName ?? '',
    facilityType: record?.facilityType ?? NOT_RECORDED,
    segment: record?.segment ?? NOT_RECORDED,
  };
}

/** Create a facility, or edit one when `record` is given. Mount only while open. */
export function FacilityFormDialog({
  record,
  onClose,
}: {
  record?: FacilityDto;
  onClose: () => void;
}) {
  const { organisationId } = useOrganisation();
  const create = useCreateRecord(organisationId, 'facilities');
  const update = useUpdateRecord(organisationId, 'facilities', record?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<FacilityFormValues>({
    resolver: zodResolver(facilityFormSchema),
    defaultValues: defaultsFrom(record),
  });

  const onError = (error: unknown) => {
    setFormError(applyServerError(error, FIELDS, setError, 'facility'));
  };

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const payload = toApi.facility(values);
    if (record) {
      update.mutate(changedFields(payload, dirtyFields), {
        onSuccess: (saved) => {
          toast.success(`Saved changes to ${saved.name}.`);
          onClose();
        },
        onError,
      });
    } else {
      create.mutate(payload, {
        onSuccess: (saved) => {
          toast.success(`Facility ${saved.name} created.`);
          onClose();
        },
        onError,
      });
    }
  });

  return (
    <RecordFormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={record ? `Edit ${record.name}` : 'Add facility'}
      description="A site your organisation operates, such as a flow station or gas plant."
      submitLabel={record ? 'Save changes' : 'Add facility'}
      submitting={create.isPending || update.isPending}
      isDirty={isDirty}
      requireChanges={Boolean(record)}
      formError={formError}
      onSubmit={(e) => void onSubmit(e)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" required error={errors.name?.message}>
          {(c) => <Input autoComplete="off" {...c} {...register('name')} />}
        </FormField>
        <FormField
          label="Code"
          required
          description="Your reference, unique among facilities."
          error={errors.code?.message}
        >
          {(c) => <Input autoComplete="off" spellCheck={false} {...c} {...register('code')} />}
        </FormField>
        <FormField label="Region or state" error={errors.region?.message}>
          {(c) => <Input autoComplete="off" {...c} {...register('region')} />}
        </FormField>
        <FormField
          label="Country"
          required
          description="Two-letter ISO code, e.g. NG."
          error={errors.country?.message}
        >
          {(c) => (
            <Input
              autoComplete="off"
              maxLength={2}
              className="uppercase"
              {...c}
              {...register('country')}
            />
          )}
        </FormField>
        <FormField
          label="Latitude"
          description="Decimal degrees, up to 6 decimal places."
          error={errors.latitude?.message}
        >
          {(c) => <Input inputMode="decimal" autoComplete="off" {...c} {...register('latitude')} />}
        </FormField>
        <FormField
          label="Longitude"
          description="Decimal degrees, up to 6 decimal places."
          error={errors.longitude?.message}
        >
          {(c) => (
            <Input inputMode="decimal" autoComplete="off" {...c} {...register('longitude')} />
          )}
        </FormField>
      </div>
      <FormField
        label="Time zone"
        required
        description="IANA name, e.g. Africa/Lagos. Defines the calendar day of activity records at this facility."
        error={errors.timeZone?.message}
      >
        {(c) => (
          <Input
            autoComplete="off"
            spellCheck={false}
            className="sm:max-w-xs"
            {...c}
            {...register('timeZone')}
          />
        )}
      </FormField>
      <fieldset className="grid gap-4 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">For NUPRC reports (optional)</legend>
        <p className="text-xs text-muted-foreground">
          Shown in the NUPRC GHG inventory. Anything left empty is flagged in the report, never
          guessed.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Terrain" error={errors.terrain?.message}>
            {(c) => (
              <NativeSelect {...c} {...register('terrain')}>
                <option value={NOT_RECORDED}>Not recorded</option>
                {FACILITY_TERRAINS.map((t) => (
                  <option key={t} value={t}>
                    {t === 'ONSHORE' ? 'Onshore' : 'Offshore'}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label="Facility type" error={errors.facilityType?.message}>
            {(c) => (
              <NativeSelect {...c} {...register('facilityType')}>
                <option value={NOT_RECORDED}>Not recorded</option>
                {NUPRC_FACILITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {NUPRC_FACILITY_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            label="Concession"
            description="Licence or lease, e.g. OML 58."
            error={errors.concession?.message}
          >
            {(c) => <Input autoComplete="off" {...c} {...register('concession')} />}
          </FormField>
          <FormField label="Field name" error={errors.fieldName?.message}>
            {(c) => <Input autoComplete="off" {...c} {...register('fieldName')} />}
          </FormField>
          <FormField label="Segment" error={errors.segment?.message}>
            {(c) => (
              <NativeSelect {...c} {...register('segment')}>
                <option value={NOT_RECORDED}>Not recorded</option>
                {FACILITY_SEGMENTS.map((t) => (
                  <option key={t} value={t}>
                    {FACILITY_SEGMENT_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
      </fieldset>
      <FormField label="Description" error={errors.description?.message}>
        {(c) => <Textarea rows={3} {...c} {...register('description')} />}
      </FormField>
    </RecordFormDialog>
  );
}
