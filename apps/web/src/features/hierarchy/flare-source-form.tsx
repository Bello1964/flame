import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { FLARE_TYPES, type FlareSourceDto } from '@flame/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useCreateRecord, useUpdateRecord } from './api';
import { RecordFormDialog } from './record-form-dialog';
import { applyServerError } from './server-errors';
import {
  changedFields,
  FLARE_TYPE_LABELS,
  flareSourceFormSchema,
  NO_FLARE_TYPE,
  toApi,
  type FlareSourceFormValues,
} from './schemas';

const FIELDS = [
  'name',
  'code',
  'flareType',
  'description',
] as const satisfies readonly (keyof FlareSourceFormValues)[];

type Props =
  | { mode: 'create'; assetId: string; assetName: string; onClose: () => void }
  | { mode: 'edit'; record: FlareSourceDto; onClose: () => void };

/** Create a flare source under an asset, or edit one. Mount only while open. */
export function FlareSourceFormDialog(props: Props) {
  const { organisationId } = useOrganisation();
  const record = props.mode === 'edit' ? props.record : undefined;
  const create = useCreateRecord(organisationId, 'flare-sources');
  const update = useUpdateRecord(organisationId, 'flare-sources', record?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<FlareSourceFormValues>({
    resolver: zodResolver(flareSourceFormSchema),
    defaultValues: {
      name: record?.name ?? '',
      code: record?.code ?? '',
      flareType: record?.flareType ?? NO_FLARE_TYPE,
      description: record?.description ?? '',
    },
  });

  const onError = (error: unknown) => {
    setFormError(applyServerError(error, FIELDS, setError, 'flare source'));
  };

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const payload = toApi.flareSource(values);
    if (props.mode === 'edit') {
      update.mutate(changedFields(payload, dirtyFields), {
        onSuccess: (saved) => {
          toast.success(`Saved changes to ${saved.name}.`);
          props.onClose();
        },
        onError,
      });
    } else {
      create.mutate(
        { assetId: props.assetId, ...payload },
        {
          onSuccess: (saved) => {
            toast.success(`Flare source ${saved.name} created.`);
            props.onClose();
          },
          onError,
        },
      );
    }
  });

  return (
    <RecordFormDialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title={record ? `Edit ${record.name}` : 'Add flare source'}
      description={
        props.mode === 'create'
          ? `A flare stack or tip on ${props.assetName}. It can’t be moved to another asset later.`
          : 'A flare stack or tip where gas is combusted.'
      }
      submitLabel={record ? 'Save changes' : 'Add flare source'}
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
          description="Your reference, unique among flare sources."
          error={errors.code?.message}
        >
          {(c) => <Input autoComplete="off" spellCheck={false} {...c} {...register('code')} />}
        </FormField>
      </div>
      <FormField label="Flare type" error={errors.flareType?.message}>
        {(c) => (
          <Controller
            control={control}
            name="flareType"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger {...c} onBlur={field.onBlur} ref={field.ref}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FLARE_TYPE}>Not recorded</SelectItem>
                  {FLARE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {FLARE_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
      </FormField>
      <FormField label="Description" error={errors.description?.message}>
        {(c) => <Textarea rows={3} {...c} {...register('description')} />}
      </FormField>
    </RecordFormDialog>
  );
}
