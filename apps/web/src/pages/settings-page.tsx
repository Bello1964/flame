import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  CANONICAL_REFERENCE,
  PRESSURE_UNIT_LABELS,
  PRESSURE_UNITS,
  TEMPERATURE_UNIT_LABELS,
  TEMPERATURE_UNITS,
  type OrganisationSettingsDto,
} from '@carbon/shared';
import { FormField } from '@/components/form-field';
import { ErrorState } from '@/components/page-state';
import { RecordPageSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { errorMessage, fieldErrorsOf } from '@/lib/api-client';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useSettings, useUpdateSettings } from '@/features/activity/api';
import { isCanonicalCondition } from '@/features/activity/labels';

const Z = /^(0|[1-9]\d{0,5})(\.\d{1,6})?$/;

const schema = z
  .object({
    temperatureValue: z
      .string()
      .trim()
      .regex(
        /^-?(0|[1-9]\d{0,19})(\.\d{1,10})?$/,
        'Enter a temperature with at most 10 decimal places',
      ),
    temperatureUnit: z.enum(TEMPERATURE_UNITS),
    pressureValue: z
      .string()
      .trim()
      .regex(
        /^(0|[1-9]\d{0,19})(\.\d{1,10})?$/,
        'Enter an absolute pressure with at most 10 decimal places',
      )
      .refine((v) => Number(v) > 0, 'Absolute pressure must be above zero'),
    pressureUnit: z.enum(PRESSURE_UNITS),
    zSource: z.string().trim(),
    zReference: z.string().trim(),
    zNote: z.string().trim().max(500),
  })
  .superRefine((v, ctx) => {
    const canonical = isCanonicalCondition(
      { value: v.temperatureValue, unit: v.temperatureUnit },
      { value: v.pressureValue, unit: v.pressureUnit },
    );
    const filled = [v.zSource, v.zReference, v.zNote].filter((x) => x !== '').length;
    if (canonical || filled === 0) return;
    const issue = (path: string, message: string) => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    for (const field of ['zSource', 'zReference'] as const) {
      const value = v[field];
      if (!value) issue(field, 'Enter both Z values and their source, or leave all three empty');
      else if (!Z.test(value) || Number(value) <= 0) {
        issue(field, 'Enter Z greater than zero, with at most 6 decimal places');
      }
    }
    if (!v.zNote) issue('zNote', 'Say where these Z values come from');
  });
type Values = z.infer<typeof schema>;

function valuesFrom(s: OrganisationSettingsDto): Values {
  return {
    temperatureValue: s.defaultReferenceTemperature.value,
    temperatureUnit: s.defaultReferenceTemperature.unit,
    pressureValue: s.defaultReferencePressure.value,
    pressureUnit: s.defaultReferencePressure.unit,
    zSource: s.defaultCompressibility?.zSource ?? '',
    zReference: s.defaultCompressibility?.zReference ?? '',
    zNote: s.defaultCompressibility?.source ?? '',
  };
}

function SettingsForm({
  settings,
  canEdit,
}: {
  settings: OrganisationSettingsDto;
  canEdit: boolean;
}) {
  const { organisationId } = useOrganisation();
  const update = useUpdateSettings(organisationId);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: valuesFrom(settings) });

  const v = useWatch({ control });
  const canonical = isCanonicalCondition(
    { value: v.temperatureValue ?? '', unit: v.temperatureUnit ?? 'CELSIUS' },
    { value: v.pressureValue ?? '', unit: v.pressureUnit ?? 'KPA_ABS' },
  );
  const saved = settings.defaultCompressibility;
  const atSavedCondition =
    v.temperatureValue?.trim() === settings.defaultReferenceTemperature.value &&
    v.temperatureUnit === settings.defaultReferenceTemperature.unit &&
    v.pressureValue?.trim() === settings.defaultReferencePressure.value &&
    v.pressureUnit === settings.defaultReferencePressure.unit;

  // Saved Z values describe the saved condition. If the condition changes here, clear them
  // so they are re-entered for the new condition (or removed), never silently carried over.
  useEffect(() => {
    if (!saved) return;
    const [zs, zr, note] = getValues(['zSource', 'zReference', 'zNote']);
    const isSaved = zs === saved.zSource && zr === saved.zReference && note === saved.source;
    const isEmpty = zs === '' && zr === '' && note === '';
    const options = { shouldDirty: true };
    if (!atSavedCondition && isSaved) {
      setValue('zSource', '', options);
      setValue('zReference', '', options);
      setValue('zNote', '', options);
    } else if (atSavedCondition && isEmpty) {
      setValue('zSource', saved.zSource, options);
      setValue('zReference', saved.zReference, options);
      setValue('zNote', saved.source, options);
    }
  }, [atSavedCondition, saved, getValues, setValue]);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const hasZ = !canonical && values.zSource !== '';
    update.mutate(
      {
        defaultReferenceTemperature: {
          value: values.temperatureValue,
          unit: values.temperatureUnit,
        },
        defaultReferencePressure: { value: values.pressureValue, unit: values.pressureUnit },
        defaultCompressibility: hasZ
          ? { zSource: values.zSource, zReference: values.zReference, source: values.zNote }
          : null,
      },
      {
        onSuccess: (next) => {
          toast.success('Settings saved.');
          reset(valuesFrom(next));
        },
        onError: (error) => {
          const fields = fieldErrorsOf(error);
          const map: [string, keyof Values][] = [
            ['defaultReferenceTemperature', 'temperatureValue'],
            ['defaultReferencePressure', 'pressureValue'],
            ['defaultCompressibility', 'zSource'],
          ];
          let mapped = false;
          for (const [api, form] of map) {
            const message = fields[api]?.[0];
            if (message) {
              setError(form, { type: 'server', message });
              mapped = true;
            }
          }
          if (!mapped) setFormError(errorMessage(error));
        },
      },
    );
  });

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      className="grid max-w-2xl gap-4 rounded-md border bg-card p-4"
    >
      <div>
        <h2 className="text-base font-semibold">Default reference condition</h2>
        <p className="text-sm text-muted-foreground">
          Prefills the temperature and absolute pressure on new activity records. People can still
          change it per record. Changing it never alters existing records. All values are
          standardised to {CANONICAL_REFERENCE.label}.
        </p>
      </div>
      {formError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {formError}
        </p>
      )}
      <fieldset disabled={!canEdit} className="grid gap-4">
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
            This is the platform standard, so records at it need no compressibility factors.
          </p>
        ) : (
          <div className="grid gap-4 border-t pt-4">
            <div>
              <h3 className="text-sm font-semibold">Compressibility factors for this condition</h3>
              <p className="text-xs text-muted-foreground">
                Optional. Records at this condition must be converted to 15 °C / 101.325 kPa, which
                needs Z at both. If you enter them here, they prefill those records (still
                editable). Leave all three empty to have people enter Z on each record.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Z at this condition" error={errors.zSource?.message}>
                {(c) => (
                  <Input inputMode="decimal" autoComplete="off" {...c} {...register('zSource')} />
                )}
              </FormField>
              <FormField label="Z at 15 °C, 101.325 kPa" error={errors.zReference?.message}>
                {(c) => (
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    {...c}
                    {...register('zReference')}
                  />
                )}
              </FormField>
            </div>
            <FormField
              label="Source of the Z values"
              description="e.g. the gas analysis report and its date. Stored with every record that uses them."
              error={errors.zNote?.message}
            >
              {(c) => <Input autoComplete="off" {...c} {...register('zNote')} />}
            </FormField>
          </div>
        )}
      </fieldset>
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={!isDirty || update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only owners and administrators can change these settings.
        </p>
      )}
    </form>
  );
}

export function SettingsPage() {
  const organisation = useOrganisation();
  const settings = useSettings(organisation.organisationId);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Organisation settings for {organisation.organisationName}.
        </p>
      </header>
      {settings.data ? (
        <SettingsForm settings={settings.data} canEdit={organisation.canManageSettings} />
      ) : settings.isError ? (
        <ErrorState
          title="Could not load settings"
          error={settings.error}
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <RecordPageSkeleton label="Loading settings" />
      )}
    </section>
  );
}
