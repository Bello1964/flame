import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type {
  MethodologyDecision,
  MethodologyEditionDto,
  MethodologyParameterDto,
  MethodologyReference,
} from '@flame/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage, fieldErrorsOf } from '@/lib/api-client';
import { RecordFormDialog } from '@/features/hierarchy/record-form-dialog';
import { useUpdateEdition, useUpdateParameter } from './api';

const required = (max: number) => z.string().trim().min(1, 'Required').max(max);

const parameterSchema = z.object({
  value: z
    .string()
    .trim()
    .regex(/^-?(0|[1-9]\d{0,19})(\.\d{1,20})?$/, 'A number with at most 20 decimal places'),
  unit: required(100),
  appliesTo: required(1000),
  sourceOrganisation: required(200),
  sourceDocument: required(500),
  sourceEdition: required(300),
  sourceLocation: required(500),
  sourceUrl: z.union([z.literal(''), z.url('Enter a full URL')]),
  retrievedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  notes: z.string().trim().max(2000),
});
type ParameterValues = z.infer<typeof parameterSchema>;

/** Edits one number of a draft edition, with its source. Mount only while open. */
export function ParameterDialog({
  edition,
  parameter,
  onClose,
}: {
  edition: MethodologyEditionDto;
  parameter: MethodologyParameterDto;
  onClose: () => void;
}) {
  const update = useUpdateParameter(edition.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<ParameterValues>({
    resolver: zodResolver(parameterSchema),
    defaultValues: {
      value: parameter.value,
      unit: parameter.unit,
      appliesTo: parameter.appliesTo,
      sourceOrganisation: parameter.sourceOrganisation,
      sourceDocument: parameter.sourceDocument,
      sourceEdition: parameter.sourceEdition,
      sourceLocation: parameter.sourceLocation,
      sourceUrl: parameter.sourceUrl ?? '',
      retrievedOn: parameter.retrievedOn,
      notes: parameter.notes ?? '',
    },
  });

  const submit = handleSubmit((v) => {
    setFormError(null);
    update.mutate(
      {
        key: parameter.key,
        body: { ...v, sourceUrl: v.sourceUrl || null, notes: v.notes || null },
      },
      {
        onSuccess: () => {
          toast.success('Number updated in the draft.');
          onClose();
        },
        onError: (err) => {
          const fields = fieldErrorsOf(err);
          for (const [k, messages] of Object.entries(fields)) {
            if (k in v) setError(k as keyof ParameterValues, { message: messages[0] ?? '' });
          }
          if (Object.keys(fields).length === 0) setFormError(errorMessage(err));
        },
      },
    );
  });

  const text = (name: keyof ParameterValues, label: string, hint?: string) => (
    <FormField
      label={label}
      required={name !== 'notes' && name !== 'sourceUrl'}
      description={hint}
      error={errors[name]?.message}
    >
      {(c) => <Input {...c} {...register(name)} />}
    </FormField>
  );

  return (
    <RecordFormDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={parameter.name}
      description={
        <>
          <span className="font-mono">{parameter.key}</span> in draft edition {edition.edition}.
          Every number must keep a traceable source.
        </>
      }
      submitLabel="Save to draft"
      submitting={update.isPending}
      isDirty={isDirty}
      requireChanges
      wide
      formError={formError}
      onSubmit={(e) => void submit(e)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {text('value', 'Value')}
        {text('unit', 'Unit')}
      </div>
      <FormField label="Used for" required error={errors.appliesTo?.message}>
        {(c) => <Textarea rows={2} {...c} {...register('appliesTo')} />}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('sourceOrganisation', 'Source organisation')}
        {text('sourceEdition', 'Edition or date of the source')}
      </div>
      {text('sourceDocument', 'Source document')}
      {text('sourceLocation', 'Page, table or equation')}
      {text('sourceUrl', 'Link to the source')}
      {text('retrievedOn', 'Checked against the source on', 'YYYY-MM-DD')}
      <FormField label="Notes" error={errors.notes?.message}>
        {(c) => <Textarea rows={2} {...c} {...register('notes')} />}
      </FormField>
    </RecordFormDialog>
  );
}

const decisionSchema = z.object({
  title: required(300),
  decision: required(4000),
  reason: required(4000),
  references: z
    .string()
    .trim()
    .min(1, 'Give at least one reference')
    .refine(
      (v) => v.split('\n').every((line) => line.trim() === '' || line.split('|').length >= 2),
      'One reference per line: label | location | link (link optional)',
    ),
});
type DecisionValues = z.infer<typeof decisionSchema>;

function parseReferences(text: string): MethodologyReference[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = '', location = '', url = ''] = line.split('|').map((s) => s.trim());
      return url ? { label, location, url } : { label, location };
    });
}

/** Edits one decision (and its reason and references) of a draft edition. */
export function DecisionDialog({
  edition,
  index,
  onClose,
}: {
  edition: MethodologyEditionDto;
  index: number;
  onClose: () => void;
}) {
  const update = useUpdateEdition(edition.id);
  const original: MethodologyDecision | undefined = edition.content.decisions[index];
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<DecisionValues>({
    resolver: zodResolver(decisionSchema),
    defaultValues: {
      title: original?.title ?? '',
      decision: original?.decision ?? '',
      reason: original?.reason ?? '',
      references: (original?.references ?? [])
        .map((r) => [r.label, r.location, r.url ?? ''].join(' | ').replace(/ \| $/, ''))
        .join('\n'),
    },
  });
  if (!original) return null;

  const submit = handleSubmit((v) => {
    setFormError(null);
    const decisions = edition.content.decisions.map((d, i) =>
      i === index
        ? {
            ...d,
            title: v.title,
            decision: v.decision,
            reason: v.reason,
            references: parseReferences(v.references),
          }
        : d,
    );
    update.mutate(
      { content: { ...edition.content, decisions } },
      {
        onSuccess: () => {
          toast.success('Decision updated in the draft.');
          onClose();
        },
        onError: (err) => {
          setFormError(errorMessage(err));
        },
      },
    );
  });

  return (
    <RecordFormDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Edit decision"
      description={`Draft edition ${String(edition.edition)}. Every decision needs a reason and at least one reference.`}
      submitLabel="Save to draft"
      submitting={update.isPending}
      isDirty={isDirty}
      requireChanges
      wide
      formError={formError}
      onSubmit={(e) => void submit(e)}
    >
      <FormField label="Title" required error={errors.title?.message}>
        {(c) => <Input {...c} {...register('title')} />}
      </FormField>
      <FormField label="Decision" required error={errors.decision?.message}>
        {(c) => <Textarea rows={3} {...c} {...register('decision')} />}
      </FormField>
      <FormField label="Why" required error={errors.reason?.message}>
        {(c) => <Textarea rows={4} {...c} {...register('reason')} />}
      </FormField>
      <FormField
        label="References"
        required
        description="One per line: label | page, table or section | link (optional)"
        error={errors.references?.message}
      >
        {(c) => (
          <Textarea rows={4} className="font-mono text-xs" {...c} {...register('references')} />
        )}
      </FormField>
    </RecordFormDialog>
  );
}

const tierSchema = z
  .object({
    label: z.string().trim().max(100, 'Use at most 100 characters'),
    sourceLabel: z.string().trim().max(300, 'Use at most 300 characters'),
    location: z.string().trim().max(300, 'Use at most 300 characters'),
    url: z.string().trim().max(1000, 'Use at most 1000 characters'),
  })
  .superRefine((v, ctx) => {
    if (v.label === '') return;
    if (v.sourceLabel === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceLabel'],
        message: 'Name the source of this classification',
      });
    }
    if (v.location === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['location'],
        message: 'Give the page, table or section',
      });
    }
  });
type TierValues = z.infer<typeof tierSchema>;

/**
 * Sets (or clears) a route's regulatory reporting tier in a draft edition, e.g. "IPCC
 * Tier 2", with its source. NUPRC reports show it as FRAMEWORK ADOPTED once approved.
 */
export function TierDialog({
  edition,
  index,
  onClose,
}: {
  edition: MethodologyEditionDto;
  index: number;
  onClose: () => void;
}) {
  const update = useUpdateEdition(edition.id);
  const route = edition.content.routes[index];
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<TierValues>({
    resolver: zodResolver(tierSchema),
    defaultValues: {
      label: route?.reportingTier?.label ?? '',
      sourceLabel: route?.reportingTier?.reference.label ?? '',
      location: route?.reportingTier?.reference.location ?? '',
      url: route?.reportingTier?.reference.url ?? '',
    },
  });
  if (!route) return null;

  const submit = handleSubmit((v) => {
    setFormError(null);
    const routes = edition.content.routes.map((r, i) => {
      if (i !== index) return r;
      const rest = { ...r };
      delete rest.reportingTier;
      if (v.label === '') return rest;
      const reference = v.url
        ? { label: v.sourceLabel, location: v.location, url: v.url }
        : { label: v.sourceLabel, location: v.location };
      return { ...rest, reportingTier: { label: v.label, reference } };
    });
    update.mutate(
      { content: { ...edition.content, routes } },
      {
        onSuccess: () => {
          toast.success('Reporting tier updated in the draft.');
          onClose();
        },
        onError: (err) => {
          setFormError(errorMessage(err));
        },
      },
    );
  });

  return (
    <RecordFormDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Regulatory reporting tier"
      description={`${route.title}, draft edition ${String(edition.edition)}. Shown as FRAMEWORK ADOPTED in NUPRC reports once this edition is approved. Leave the tier empty to remove it.`}
      submitLabel="Save to draft"
      submitting={update.isPending}
      isDirty={isDirty}
      requireChanges
      formError={formError}
      onSubmit={(e) => void submit(e)}
    >
      <FormField
        label="Tier"
        description="e.g. IPCC Tier 2. Only from a documented classification."
        error={errors.label?.message}
      >
        {(c) => <Input {...c} {...register('label')} />}
      </FormField>
      <FormField label="Source" error={errors.sourceLabel?.message}>
        {(c) => <Input {...c} {...register('sourceLabel')} />}
      </FormField>
      <FormField label="Page, table or section" error={errors.location?.message}>
        {(c) => <Input {...c} {...register('location')} />}
      </FormField>
      <FormField label="Link" error={errors.url?.message}>
        {(c) => <Input type="url" {...c} {...register('url')} />}
      </FormField>
    </RecordFormDialog>
  );
}
