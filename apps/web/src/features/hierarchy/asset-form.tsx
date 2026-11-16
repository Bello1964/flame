import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { AssetDto } from '@flame/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useCreateRecord, useUpdateRecord } from './api';
import { RecordFormDialog } from './record-form-dialog';
import { applyServerError } from './server-errors';
import { assetFormSchema, changedFields, toApi, type AssetFormValues } from './schemas';

const FIELDS = [
  'name',
  'code',
  'assetType',
  'description',
] as const satisfies readonly (keyof AssetFormValues)[];

type Props =
  | { mode: 'create'; facilityId: string; facilityName: string; onClose: () => void }
  | { mode: 'edit'; record: AssetDto; onClose: () => void };

/** Create an asset under a facility, or edit one. Mount only while open. */
export function AssetFormDialog(props: Props) {
  const { organisationId } = useOrganisation();
  const record = props.mode === 'edit' ? props.record : undefined;
  const create = useCreateRecord(organisationId, 'assets');
  const update = useUpdateRecord(organisationId, 'assets', record?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      name: record?.name ?? '',
      code: record?.code ?? '',
      assetType: record?.assetType ?? '',
      description: record?.description ?? '',
    },
  });

  const onError = (error: unknown) => {
    setFormError(applyServerError(error, FIELDS, setError, 'asset'));
  };

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const payload = toApi.asset(values);
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
        { facilityId: props.facilityId, ...payload },
        {
          onSuccess: (saved) => {
            toast.success(`Asset ${saved.name} created.`);
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
      title={record ? `Edit ${record.name}` : 'Add asset'}
      description={
        props.mode === 'create'
          ? `Equipment at ${props.facilityName}. An asset can’t be moved to another facility later.`
          : 'Equipment at a facility, such as a separator or compressor.'
      }
      submitLabel={record ? 'Save changes' : 'Add asset'}
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
          description="Your reference, unique among assets."
          error={errors.code?.message}
        >
          {(c) => <Input autoComplete="off" spellCheck={false} {...c} {...register('code')} />}
        </FormField>
      </div>
      <FormField
        label="Asset type"
        description="For example: separator, compressor, production train."
        error={errors.assetType?.message}
      >
        {(c) => <Input autoComplete="off" {...c} {...register('assetType')} />}
      </FormField>
      <FormField label="Description" error={errors.description?.message}>
        {(c) => <Textarea rows={3} {...c} {...register('description')} />}
      </FormField>
    </RecordFormDialog>
  );
}
