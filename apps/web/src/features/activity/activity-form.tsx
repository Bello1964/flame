import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  ACTIVITY_TYPES,
  CANONICAL_REFERENCE,
  MEASUREMENT_METHODS,
  OVERLAP_UNCONFIRMED_CODE,
  PRESSURE_UNIT_LABELS,
  PRESSURE_UNITS,
  RATE_UNIT_LABELS,
  RATE_UNITS,
  TEMPERATURE_UNIT_LABELS,
  TEMPERATURE_UNITS,
  VOLUME_UNIT_LABELS,
  VOLUME_UNITS,
  type ActivityRecordDto,
  type OrganisationSettingsDto,
} from '@flame/shared';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, errorMessage, fieldErrorsOf } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { RecordFormDialog } from '@/features/hierarchy/record-form-dialog';
import { useCreateActivity, useUpdateActivity } from './api';
import {
  activityFormSchema,
  API_FIELD_TO_FORM,
  EARLIEST_ACTIVITY_DATE,
  initialValues,
  toActivityFields,
  type ActivityFormValues,
} from './form-schema';
import { ACTIVITY_TYPE_LABELS, isCanonicalCondition, METHOD_LABELS } from './labels';

type Props =
  | {
      mode: 'create';
      flareSourceId: string;
      flareSourceName: string;
      settings: OrganisationSettingsDto;
      onClose: () => void;
    }
  | {
      mode: 'edit';
      record: ActivityRecordDto;
      settings: OrganisationSettingsDto;
      onClose: () => void;
    };

interface Overlap {
  id: string;
  periodStart: string;
  periodEnd: string;
}

function overlapsOf(error: unknown): Overlap[] | null {
  if (!(error instanceof ApiError) || error.code !== OVERLAP_UNCONFIRMED_CODE) return null;
  const details = error.details;
  if (typeof details !== 'object' || details === null || !('overlapping' in details)) return [];
  return Array.isArray(details.overlapping) ? (details.overlapping as Overlap[]) : [];
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t pt-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-sm font-semibold">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </fieldset>
  );
}

/** Create or edit a gas activity record. Mount only while open. */
export function ActivityFormDialog(props: Props) {
  const { organisationId } = useOrganisation();
  const record = props.mode === 'edit' ? props.record : undefined;
  const create = useCreateActivity(organisationId);
  const update = useUpdateActivity(organisationId, record?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  // The overlap warning belongs to the period and type it was shown for (see below).
  const [overlapWarning, setOverlapWarning] = useState<{ key: string; overlaps: Overlap[] } | null>(
    null,
  );

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: initialValues(record, props.settings),
  });
  const v = useWatch({ control });

  // The organisation's default Z values belong to its default reference condition only.
  // At that condition they are filled in (if the fields are empty); away from it, values
  // still equal to the defaults are cleared so they can't be applied where they don't belong.
  const orgZ = props.settings.defaultCompressibility;
  const atOrgDefault =
    v.temperatureValue?.trim() === props.settings.defaultReferenceTemperature.value &&
    v.temperatureUnit === props.settings.defaultReferenceTemperature.unit &&
    v.pressureValue?.trim() === props.settings.defaultReferencePressure.value &&
    v.pressureUnit === props.settings.defaultReferencePressure.unit;
  const usingOrgDefaultZ =
    orgZ !== null &&
    atOrgDefault &&
    v.zSource === orgZ.zSource &&
    v.zReference === orgZ.zReference &&
    v.compressibilitySource === orgZ.source;
  // Act only when the condition *moves* to or from the default during this session.
  // Opening a form (e.g. editing a record saved at an older default) never changes Z.
  const wasAtOrgDefault = useRef(atOrgDefault);
  useEffect(() => {
    if (wasAtOrgDefault.current === atOrgDefault) return;
    wasAtOrgDefault.current = atOrgDefault;
    if (!orgZ) return;
    const current = getValues(['zSource', 'zReference', 'compressibilitySource']);
    const isDefault =
      current[0] === orgZ.zSource && current[1] === orgZ.zReference && current[2] === orgZ.source;
    const isEmpty = current.every((x) => x === '');
    const options = { shouldDirty: true, shouldValidate: false };
    if (atOrgDefault && isEmpty) {
      setValue('zSource', orgZ.zSource, options);
      setValue('zReference', orgZ.zReference, options);
      setValue('compressibilitySource', orgZ.source, options);
    } else if (!atOrgDefault && isDefault) {
      setValue('zSource', '', options);
      setValue('zReference', '', options);
      setValue('compressibilitySource', '', options);
    }
  }, [atOrgDefault, orgZ, getValues, setValue]);
  const canonical = isCanonicalCondition(
    { value: v.temperatureValue ?? '', unit: v.temperatureUnit ?? 'CELSIUS' },
    { value: v.pressureValue ?? '', unit: v.pressureUnit ?? 'KPA_ABS' },
  );
  // "Save anyway" may only confirm overlaps the user has seen: if the period or activity
  // type changes after the warning, the warning (and its button) no longer applies.
  const overlapKey = [
    v.kind,
    v.periodStart,
    v.kind === 'PERIOD' ? v.periodEnd : '',
    v.activityType,
  ].join('|');
  const overlaps = overlapWarning?.key === overlapKey ? overlapWarning.overlaps : null;
  const setOverlaps = (list: Overlap[] | null) => {
    setOverlapWarning(list ? { key: overlapKey, overlaps: list } : null);
  };

  const onError = (error: unknown) => {
    const overlapping = overlapsOf(error);
    if (overlapping) {
      setOverlaps(overlapping);
      return;
    }
    let mapped = false;
    for (const [field, messages] of Object.entries(fieldErrorsOf(error))) {
      const target = API_FIELD_TO_FORM[field];
      if (target && messages[0]) {
        setError(target, { type: 'server', message: messages[0] });
        mapped = true;
      }
    }
    if (!mapped) {
      setFormError(
        error instanceof ApiError && error.status === 403 && error.code === 'FORBIDDEN'
          ? 'Your role does not allow recording activity data.'
          : errorMessage(error),
      );
    }
  };

  const submit = (acknowledgeOverlap: boolean) =>
    handleSubmit((values) => {
      setFormError(null);
      const fields = toActivityFields(values);
      const ack = acknowledgeOverlap ? { acknowledgeOverlap: true } : {};
      const done = (message: string) => () => {
        toast.success(message);
        props.onClose();
      };
      if (props.mode === 'edit') {
        update.mutate(
          { ...fields, ...ack },
          { onSuccess: done('Activity record saved.'), onError },
        );
      } else {
        create.mutate(
          { ...fields, ...ack, flareSourceId: props.flareSourceId, kind: values.kind },
          { onSuccess: done('Activity record added as a draft.'), onError },
        );
      }
    });

  const submitting = create.isPending || update.isPending;

  return (
    <RecordFormDialog
      open
      wide
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title={record ? 'Edit activity record' : 'Record gas activity'}
      description={
        props.mode === 'create'
          ? `Operational quantities for ${props.flareSourceName}. Saved as a draft; no emissions are calculated.`
          : 'Changes are saved to the draft and recorded in the audit log.'
      }
      submitLabel={record ? 'Save changes' : 'Save draft'}
      submitting={submitting}
      isDirty={isDirty}
      requireChanges={Boolean(record)}
      formError={formError}
      onSubmit={(e) => {
        setOverlaps(null);
        void submit(false)(e);
      }}
    >
      {overlaps && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm"
        >
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            This overlaps{' '}
            {overlaps.length === 1
              ? 'another record'
              : `${String(overlaps.length)} other records`}{' '}
            for the same flare source and activity type
          </p>
          <ul className="ml-6 list-disc text-muted-foreground">
            {overlaps.map((o) => (
              <li key={o.id}>
                {o.periodStart === o.periodEnd
                  ? formatDate(o.periodStart)
                  : `${formatDate(o.periodStart)} – ${formatDate(o.periodEnd)}`}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Nothing will be merged. If you save, both records are kept and flagged for review.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={submitting}
              onClick={(e) => void submit(true)(e)}
            >
              {submitting && <Loader2 className="animate-spin" aria-hidden />}
              Save anyway
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setOverlaps(null);
              }}
            >
              Review dates
            </Button>
          </div>
        </div>
      )}

      <Section title="Period and activity">
        {props.mode === 'create' && (
          <div role="radiogroup" aria-label="Record kind" className="flex flex-wrap gap-2">
            {(['DAILY', 'PERIOD'] as const).map((kind) => (
              <label
                key={kind}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
              >
                <input type="radio" value={kind} {...register('kind')} className="accent-primary" />
                {kind === 'DAILY' ? 'Daily record (one day)' : 'Reporting period'}
              </label>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={v.kind === 'DAILY' ? 'Date' : 'First day'}
            required
            error={errors.periodStart?.message}
          >
            {(c) => (
              <Input type="date" min={EARLIEST_ACTIVITY_DATE} {...c} {...register('periodStart')} />
            )}
          </FormField>
          {v.kind === 'PERIOD' && (
            <FormField label="Last day" required error={errors.periodEnd?.message}>
              {(c) => (
                <Input type="date" min={EARLIEST_ACTIVITY_DATE} {...c} {...register('periodEnd')} />
              )}
            </FormField>
          )}
        </div>
        <FormField
          label="Activity type"
          required
          description="Flaring burns the gas; venting releases it without combustion. They are kept separate everywhere."
          error={errors.activityType?.message}
        >
          {(c) => (
            <NativeSelect {...c} {...register('activityType')}>
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        {v.activityType === 'OTHER_RELEASE' && (
          <FormField label="Type of release" required error={errors.otherTypeDescription?.message}>
            {(c) => <Input {...c} {...register('otherTypeDescription')} />}
          </FormField>
        )}
      </Section>

      <Section
        title="Quantities"
        hint="Enter an average rate, a total volume, or both. Values are kept exactly as typed."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Average rate" error={errors.rateValue?.message}>
            {(c) => (
              <div className="flex gap-2">
                <Input inputMode="decimal" autoComplete="off" {...c} {...register('rateValue')} />
                <NativeSelect
                  aria-label="Rate unit"
                  className="w-32 shrink-0"
                  {...register('rateUnit')}
                >
                  {RATE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {RATE_UNIT_LABELS[u]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </FormField>
          <FormField label="Total volume" error={errors.volumeValue?.message}>
            {(c) => (
              <div className="flex gap-2">
                <Input inputMode="decimal" autoComplete="off" {...c} {...register('volumeValue')} />
                <NativeSelect
                  aria-label="Volume unit"
                  className="w-32 shrink-0"
                  {...register('volumeUnit')}
                >
                  {VOLUME_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {VOLUME_UNIT_LABELS[u]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </FormField>
        </div>
        <FormField
          label="Actual operating hours"
          description="Only if measured. Without it, no volume is derived from the rate: a 24-hour day is never assumed."
          error={errors.operatingHours?.message}
        >
          {(c) => (
            <div className="flex items-center gap-2 sm:max-w-xs">
              <Input
                inputMode="decimal"
                autoComplete="off"
                {...c}
                {...register('operatingHours')}
              />
              <span className="text-sm text-muted-foreground">hours</span>
            </div>
          )}
        </FormField>
      </Section>

      <Section
        title="Reference condition"
        hint={`The temperature and absolute pressure the quantities are expressed at. Prefilled with your organisation's default; values are standardised to ${CANONICAL_REFERENCE.label}.`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Temperature" required error={errors.temperatureValue?.message}>
            {(c) => (
              <div className="flex gap-2">
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  {...c}
                  {...register('temperatureValue')}
                />
                <NativeSelect
                  aria-label="Temperature unit"
                  className="w-24 shrink-0"
                  {...register('temperatureUnit')}
                >
                  {TEMPERATURE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {TEMPERATURE_UNIT_LABELS[u]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </FormField>
          <FormField
            label="Absolute pressure"
            required
            description="Absolute, not gauge."
            error={errors.pressureValue?.message}
          >
            {(c) => (
              <div className="flex gap-2">
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  {...c}
                  {...register('pressureValue')}
                />
                <NativeSelect
                  aria-label="Pressure unit"
                  className="w-24 shrink-0"
                  {...register('pressureUnit')}
                >
                  {PRESSURE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {PRESSURE_UNIT_LABELS[u]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </FormField>
        </div>
        {canonical ? (
          <p className="text-xs text-muted-foreground">
            This is the platform standard, so no compressibility correction applies.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Z at this condition"
              required
              description="Compressibility factor at the temperature and pressure above."
              error={errors.zSource?.message}
            >
              {(c) => (
                <Input inputMode="decimal" autoComplete="off" {...c} {...register('zSource')} />
              )}
            </FormField>
            <FormField
              label="Z at 15 °C, 101.325 kPa"
              required
              description="Compressibility factor at the platform standard condition."
              error={errors.zReference?.message}
            >
              {(c) => (
                <Input inputMode="decimal" autoComplete="off" {...c} {...register('zReference')} />
              )}
            </FormField>
            <div className="sm:col-span-2">
              <FormField
                label="Source of the Z values"
                description={
                  usingOrgDefaultZ
                    ? "Prefilled from your organisation's settings for this condition."
                    : 'e.g. the gas analysis or calculation they come from.'
                }
                error={errors.compressibilitySource?.message}
              >
                {(c) => <Input autoComplete="off" {...c} {...register('compressibilitySource')} />}
              </FormField>
            </div>
          </div>
        )}
      </Section>

      <Section title="How it was measured">
        <div role="radiogroup" aria-label="Measured or estimated" className="flex flex-wrap gap-2">
          {(['MEASURED', 'ESTIMATED'] as const).map((basis) => (
            <label
              key={basis}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                type="radio"
                value={basis}
                {...register('measurementBasis')}
                className="accent-primary"
              />
              {basis === 'MEASURED' ? 'Measured' : 'Estimated'}
            </label>
          ))}
        </div>
        {v.measurementBasis === 'ESTIMATED' && (
          <FormField
            label="How was it estimated?"
            required
            error={errors.estimateExplanation?.message}
          >
            {(c) => <Textarea rows={2} {...c} {...register('estimateExplanation')} />}
          </FormField>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Measurement method" required error={errors.measurementMethod?.message}>
            {(c) => (
              <NativeSelect {...c} {...register('measurementMethod')}>
                {MEASUREMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          {v.measurementMethod === 'OTHER' && (
            <FormField
              label="Describe the method"
              required
              error={errors.methodDescription?.message}
            >
              {(c) => <Input {...c} {...register('methodDescription')} />}
            </FormField>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Start time"
            description="Local time the flaring or venting started (24-hour, e.g. 06:30). For the NUPRC monthly log."
            error={errors.startTime?.message}
          >
            {(c) => (
              <Input
                inputMode="numeric"
                placeholder="HH:MM"
                autoComplete="off"
                className="sm:max-w-32"
                {...c}
                {...register('startTime')}
              />
            )}
          </FormField>
          <FormField
            label="Gas source or type"
            description="e.g. sour inlet gas, acid gas. For the NUPRC monthly log."
            error={errors.gasSource?.message}
          >
            {(c) => <Input autoComplete="off" {...c} {...register('gasSource')} />}
          </FormField>
        </div>
        <FormField label="Notes" error={errors.notes?.message}>
          {(c) => <Textarea rows={2} {...c} {...register('notes')} />}
        </FormField>
      </Section>
    </RecordFormDialog>
  );
}
