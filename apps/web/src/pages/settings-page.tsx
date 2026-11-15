import { useState } from 'react';
import { useForm } from 'react-hook-form';
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

const schema = z.object({
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
});
type Values = z.infer<typeof schema>;

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
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      temperatureValue: settings.defaultReferenceTemperature.value,
      temperatureUnit: settings.defaultReferenceTemperature.unit,
      pressureValue: settings.defaultReferencePressure.value,
      pressureUnit: settings.defaultReferencePressure.unit,
    },
  });

  const onSubmit = handleSubmit((v) => {
    setFormError(null);
    update.mutate(
      {
        defaultReferenceTemperature: { value: v.temperatureValue, unit: v.temperatureUnit },
        defaultReferencePressure: { value: v.pressureValue, unit: v.pressureUnit },
      },
      {
        onSuccess: (saved) => {
          toast.success('Default reference condition saved.');
          reset({
            temperatureValue: saved.defaultReferenceTemperature.value,
            temperatureUnit: saved.defaultReferenceTemperature.unit,
            pressureValue: saved.defaultReferencePressure.value,
            pressureUnit: saved.defaultReferencePressure.unit,
          });
        },
        onError: (error) => {
          const fields = fieldErrorsOf(error);
          const t = fields['defaultReferenceTemperature']?.[0];
          const p = fields['defaultReferencePressure']?.[0];
          if (t) setError('temperatureValue', { type: 'server', message: t });
          if (p) setError('pressureValue', { type: 'server', message: p });
          if (!t && !p) setFormError(errorMessage(error));
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
          change it per record. Changing it never alters existing records. The platform standard is{' '}
          {CANONICAL_REFERENCE.label}.
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
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
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
              <Input inputMode="decimal" autoComplete="off" {...c} {...register('pressureValue')} />
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
          Only owners and administrators can change this.
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
