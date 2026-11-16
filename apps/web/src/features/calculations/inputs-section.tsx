import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Ban, Plus } from 'lucide-react';
import {
  COMPOSITION_TOTAL_TOLERANCE,
  EFFICIENCY_BASES,
  GAS_COMPONENT_LABELS,
  GAS_COMPONENTS,
  type EfficiencyBasis,
  type FlareEfficiencyDto,
  type GasComponent,
  type GasCompositionDto,
} from '@flame/shared';
import { FormField } from '@/components/form-field';
import { EmptyState, ErrorState } from '@/components/page-state';
import { TableSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage, fieldErrorsOf } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { RecordFormDialog } from '@/features/hierarchy/record-form-dialog';
import { SectionHeader } from '@/features/hierarchy/record-detail';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { ActionDialog } from '@/features/activity/workflow-actions';
import type { ActionConfig } from '@/features/activity/workflow-config';
import {
  useCompositions,
  useCreateComposition,
  useCreateEfficiency,
  useEfficiencies,
  useWithdrawInput,
} from './api';
import { EFFICIENCY_BASIS_LABELS } from './labels';

const PERCENT = /^(0|[1-9]\d{0,2})(\.\d{1,6})?$/;
const percent = z
  .string()
  .trim()
  .regex(PERCENT, 'A percentage with at most 6 decimal places')
  .refine((v) => Number(v) <= 100, 'At most 100');
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker or YYYY-MM-DD')
  .refine((v) => v >= '2000-01-01', 'Dates before 1 January 2000 can’t be used');

const WITHDRAW: ActionConfig = {
  label: 'Withdraw',
  pending: 'Withdrawing…',
  done: 'Withdrawn.',
  icon: Ban,
  tone: 'destructive',
  dialog: {
    title: 'Withdraw this record?',
    description:
      'New calculations won’t use it. Calculations that already used it keep a copy of its values. It stays listed, read-only.',
    comment: 'required',
    commentLabel: 'Reason',
    placeholder: 'e.g. Entered against the wrong flare source',
  },
};

/** Exact sum of decimal strings with up to 6 decimal places (no floating-point error). */
function total(values: string[]): string | null {
  let micro = 0n;
  for (const v of values) {
    if (!PERCENT.test(v.trim())) return null;
    const [whole = '0', frac = ''] = v.trim().split('.');
    micro += BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, '0'));
  }
  const whole = micro / 1_000_000n;
  const frac = (micro % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

// ─── Gas analyses ─────────────────────────────────────────────────────────────

const compositionSchema = z
  .object({
    validFrom: date,
    sampleDate: date,
    sampleReference: z.string().trim().min(1, 'Enter the lab report or record reference').max(300),
    analysisMethod: z.string().trim().max(300),
    hexanesPlusCarbonNumber: z.string().trim(),
    notes: z.string().trim().max(2000),
    ...(Object.fromEntries(GAS_COMPONENTS.map((c) => [c, percent])) as Record<
      GasComponent,
      typeof percent
    >),
  })
  .superRefine((v, ctx) => {
    if (Number(v.hexanesPlus) > 0 && !/^\d{1,3}(\.\d{1,4})?$/.test(v.hexanesPlusCarbonNumber)) {
      ctx.addIssue({
        code: 'custom',
        path: ['hexanesPlusCarbonNumber'],
        message: 'Enter the C₆+ carbon number from the analysis',
      });
    } else if (Number(v.hexanesPlus) > 0 && Number(v.hexanesPlusCarbonNumber) < 6) {
      ctx.addIssue({ code: 'custom', path: ['hexanesPlusCarbonNumber'], message: 'At least 6' });
    }
    const t = total(GAS_COMPONENTS.map((c) => v[c]));
    if (t !== null && Math.abs(Number(t) - 100) > Number(COMPOSITION_TOTAL_TOLERANCE)) {
      ctx.addIssue({
        code: 'custom',
        path: ['methane'],
        message: `The components total ${t}%; they must total 100% ± ${COMPOSITION_TOTAL_TOLERANCE}%`,
      });
    }
  });
type CompositionValues = z.infer<typeof compositionSchema>;

function CompositionDialog({ sourceId, onClose }: { sourceId: string; onClose: () => void }) {
  const { organisationId } = useOrganisation();
  const create = useCreateComposition(organisationId, sourceId);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<CompositionValues>({
    resolver: zodResolver(compositionSchema),
    defaultValues: {
      validFrom: '',
      sampleDate: '',
      sampleReference: '',
      analysisMethod: '',
      hexanesPlusCarbonNumber: '',
      notes: '',
      ...(Object.fromEntries(GAS_COMPONENTS.map((c) => [c, '0'])) as Record<GasComponent, string>),
    },
  });
  const values = useWatch({ control });
  const running = total(GAS_COMPONENTS.map((c) => values[c] ?? ''));

  const submit = handleSubmit((v) => {
    setFormError(null);
    create.mutate(
      {
        validFrom: v.validFrom,
        sampleDate: v.sampleDate,
        sampleReference: v.sampleReference,
        analysisMethod: v.analysisMethod || null,
        components: Object.fromEntries(GAS_COMPONENTS.map((c) => [c, v[c]])) as Record<
          GasComponent,
          string
        >,
        hexanesPlusCarbonNumber: Number(v.hexanesPlus) > 0 ? v.hexanesPlusCarbonNumber : null,
        notes: v.notes || null,
      },
      {
        onSuccess: () => {
          toast.success('Gas analysis recorded.');
          onClose();
        },
        onError: (err) => {
          const fields = fieldErrorsOf(err);
          for (const [k, m] of Object.entries(fields)) {
            setError((k === 'components' ? 'methane' : k) as keyof CompositionValues, {
              message: m[0] ?? '',
            });
          }
          if (Object.keys(fields).length === 0) setFormError(errorMessage(err));
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
      title="Record a gas analysis"
      description="Mole percent per component, exactly as on the analysis. Values are never rescaled; they must total 100% within ±0.5%."
      submitLabel="Record analysis"
      submitting={create.isPending}
      isDirty={isDirty}
      wide
      formError={formError}
      onSubmit={(e) => void submit(e)}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Sample date" required error={errors.sampleDate?.message}>
          {(c) => <Input type="date" {...c} {...register('sampleDate')} />}
        </FormField>
        <FormField
          label="Use from"
          required
          description="For activity periods starting on or after this date."
          error={errors.validFrom?.message}
        >
          {(c) => <Input type="date" {...c} {...register('validFrom')} />}
        </FormField>
        <FormField label="Report reference" required error={errors.sampleReference?.message}>
          {(c) => <Input {...c} placeholder="e.g. LAB-0423" {...register('sampleReference')} />}
        </FormField>
      </div>
      <FormField label="Analysis method" error={errors.analysisMethod?.message}>
        {(c) => (
          <Input
            {...c}
            placeholder="e.g. Gas chromatography, GPA 2261"
            {...register('analysisMethod')}
          />
        )}
      </FormField>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Components (mole %)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {GAS_COMPONENTS.map((c) => (
            <FormField key={c} label={GAS_COMPONENT_LABELS[c]} required error={errors[c]?.message}>
              {(ctl) => (
                <Input inputMode="decimal" className="tabular-nums" {...ctl} {...register(c)} />
              )}
            </FormField>
          ))}
        </div>
        <p className="text-sm" aria-live="polite">
          Total:{' '}
          <span
            className={
              running !== null &&
              Math.abs(Number(running) - 100) <= Number(COMPOSITION_TOTAL_TOLERANCE)
                ? 'font-medium tabular-nums'
                : 'font-medium text-destructive tabular-nums'
            }
          >
            {running === null ? '—' : `${running}%`}
          </span>
        </p>
      </fieldset>
      {Number(values.hexanesPlus ?? 0) > 0 && (
        <FormField
          label="C₆+ carbon number"
          required
          description="Average carbon atoms per molecule of the C₆+ fraction, from the analysis. There is no default."
          error={errors.hexanesPlusCarbonNumber?.message}
        >
          {(c) => <Input inputMode="decimal" {...c} {...register('hexanesPlusCarbonNumber')} />}
        </FormField>
      )}
      <FormField label="Notes" error={errors.notes?.message}>
        {(c) => <Textarea rows={2} {...c} {...register('notes')} />}
      </FormField>
    </RecordFormDialog>
  );
}

// ─── Flare efficiency ─────────────────────────────────────────────────────────

const efficiencySchema = z
  .object({
    validFrom: date,
    basis: z.enum(EFFICIENCY_BASES),
    combustionEfficiencyPercent: percent.refine((v) => Number(v) > 0, 'Above zero'),
    uncombustedMethanePercent: z.string().trim(),
    sourceReference: z
      .string()
      .trim()
      .min(1, 'Enter the test report, datasheet or regulation')
      .max(500),
    testDate: z.string(),
    notes: z.string().trim().max(2000),
  })
  .superRefine((v, ctx) => {
    if (
      v.basis !== 'DESIGN_REQUIREMENT' &&
      !percent.safeParse(v.uncombustedMethanePercent).success
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['uncombustedMethanePercent'],
        message: 'Enter the uncombusted methane percentage',
      });
    }
    if (v.basis === 'MEASURED_TEST' && !date.safeParse(v.testDate).success) {
      ctx.addIssue({ code: 'custom', path: ['testDate'], message: 'Enter the test date' });
    }
  });
type EfficiencyValues = z.infer<typeof efficiencySchema>;

function EfficiencyDialog({ sourceId, onClose }: { sourceId: string; onClose: () => void }) {
  const { organisationId } = useOrganisation();
  const create = useCreateEfficiency(organisationId, sourceId);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<EfficiencyValues>({
    resolver: zodResolver(efficiencySchema),
    defaultValues: {
      validFrom: '',
      basis: 'MEASURED_TEST',
      combustionEfficiencyPercent: '',
      uncombustedMethanePercent: '',
      sourceReference: '',
      testDate: '',
      notes: '',
    },
  });
  const basis = useWatch({ control, name: 'basis' });

  const submit = handleSubmit((v) => {
    setFormError(null);
    create.mutate(
      {
        validFrom: v.validFrom,
        basis: v.basis,
        combustionEfficiencyPercent: v.combustionEfficiencyPercent,
        uncombustedMethanePercent: v.uncombustedMethanePercent || null,
        sourceReference: v.sourceReference,
        testDate: v.testDate || null,
        notes: v.notes || null,
      },
      {
        onSuccess: () => {
          toast.success('Flare efficiency recorded.');
          onClose();
        },
        onError: (err) => {
          const fields = fieldErrorsOf(err);
          for (const [k, m] of Object.entries(fields))
            setError(k as keyof EfficiencyValues, { message: m[0] ?? '' });
          if (Object.keys(fields).length === 0) setFormError(errorMessage(err));
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
      title="Record flare efficiency"
      description="Test or vendor values are used in calculations. A design requirement (such as NUPRC's 98% DRE) is recorded for reference only and is never treated as achieved performance."
      submitLabel="Record efficiency"
      submitting={create.isPending}
      isDirty={isDirty}
      wide
      formError={formError}
      onSubmit={(e) => void submit(e)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Basis" required error={errors.basis?.message}>
          {(c) => (
            <NativeSelect {...c} {...register('basis')}>
              {EFFICIENCY_BASES.map((b: EfficiencyBasis) => (
                <option key={b} value={b}>
                  {EFFICIENCY_BASIS_LABELS[b]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Use from" required error={errors.validFrom?.message}>
          {(c) => <Input type="date" {...c} {...register('validFrom')} />}
        </FormField>
        <FormField
          label={
            basis === 'DESIGN_REQUIREMENT'
              ? 'Design destruction efficiency (%)'
              : 'Carbon converted to CO₂ (%)'
          }
          required
          error={errors.combustionEfficiencyPercent?.message}
        >
          {(c) => <Input inputMode="decimal" {...c} {...register('combustionEfficiencyPercent')} />}
        </FormField>
        {basis !== 'DESIGN_REQUIREMENT' && (
          <FormField
            label="Methane leaving uncombusted (%)"
            required
            error={errors.uncombustedMethanePercent?.message}
          >
            {(c) => <Input inputMode="decimal" {...c} {...register('uncombustedMethanePercent')} />}
          </FormField>
        )}
        <FormField label="Source reference" required error={errors.sourceReference?.message}>
          {(c) => (
            <Input
              {...c}
              placeholder="e.g. Annual flare test report T-9"
              {...register('sourceReference')}
            />
          )}
        </FormField>
        {basis === 'MEASURED_TEST' && (
          <FormField label="Test date" required error={errors.testDate?.message}>
            {(c) => <Input type="date" {...c} {...register('testDate')} />}
          </FormField>
        )}
      </div>
      <FormField label="Notes" error={errors.notes?.message}>
        {(c) => <Textarea rows={2} {...c} {...register('notes')} />}
      </FormField>
    </RecordFormDialog>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function WithdrawButton({
  kind,
  id,
}: {
  kind: 'gas-compositions' | 'flare-efficiencies';
  id: string;
}) {
  const { organisationId } = useOrganisation();
  const withdraw = useWithdrawInput(organisationId, kind);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => {
          withdraw.reset();
          setOpen(true);
        }}
      >
        Withdraw
      </Button>
      {open && (
        <ActionDialog
          config={WITHDRAW}
          pending={withdraw.isPending}
          error={withdraw.error}
          onCancel={() => {
            setOpen(false);
          }}
          onConfirm={(reason) => {
            withdraw.mutate(
              { id, reason: reason ?? '' },
              {
                onSuccess: () => {
                  toast.success(WITHDRAW.done);
                  setOpen(false);
                },
              },
            );
          }}
        />
      )}
    </>
  );
}

function Status({
  r,
}: {
  r: { status: 'ACTIVE' | 'WITHDRAWN'; withdrawal: { reason: string } | null };
}) {
  return r.status === 'ACTIVE' ? (
    <Badge variant="outline">Active</Badge>
  ) : (
    <Badge variant="muted" title={r.withdrawal?.reason}>
      Withdrawn
    </Badge>
  );
}

/** Gas analyses and flare efficiency on a flare source page: the inputs calculations use. */
export function CalculationInputsSection({
  flareSource,
}: {
  flareSource: { id: string; status: 'ACTIVE' | 'ARCHIVED' };
}) {
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const compositions = useCompositions(orgId, flareSource.id);
  const efficiencies = useEfficiencies(orgId, flareSource.id);
  const [adding, setAdding] = useState<'composition' | 'efficiency' | null>(null);
  const canWrite = organisation.canWriteActivity && flareSource.status === 'ACTIVE';

  const compositionRows = (rows: GasCompositionDto[]) => (
    <div className="rounded-md border bg-card">
      <Table>
        <caption className="sr-only">Gas analyses, newest first. Mole percent.</caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Use from</TableHead>
            <TableHead className="hidden sm:table-cell">Sampled</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">CH₄ %</TableHead>
            <TableHead className="hidden text-right md:table-cell">CO₂ %</TableHead>
            <TableHead className="hidden text-right md:table-cell">Total %</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            {canWrite && <TableHead className="sr-only">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{formatDate(r.validFrom)}</TableCell>
              <TableCell className="hidden whitespace-nowrap sm:table-cell">
                {formatDate(r.sampleDate)}
              </TableCell>
              <TableCell>{r.sampleReference}</TableCell>
              <TableCell className="text-right tabular-nums">{r.components.methane}</TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {r.components.carbonDioxide}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {r.total}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <Status r={r} />
              </TableCell>
              {canWrite && (
                <TableCell className="text-right">
                  {r.status === 'ACTIVE' && <WithdrawButton kind="gas-compositions" id={r.id} />}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const efficiencyRows = (rows: FlareEfficiencyDto[]) => (
    <div className="rounded-md border bg-card">
      <Table>
        <caption className="sr-only">Flare efficiency records, newest first.</caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Use from</TableHead>
            <TableHead>Basis</TableHead>
            <TableHead className="text-right">To CO₂ %</TableHead>
            <TableHead className="text-right">Unburned CH₄ %</TableHead>
            <TableHead className="hidden md:table-cell">Source</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            {canWrite && <TableHead className="sr-only">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{formatDate(r.validFrom)}</TableCell>
              <TableCell>{EFFICIENCY_BASIS_LABELS[r.basis]}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.combustionEfficiencyPercent}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.uncombustedMethanePercent ?? '—'}
              </TableCell>
              <TableCell className="hidden md:table-cell">{r.sourceReference}</TableCell>
              <TableCell className="hidden sm:table-cell">
                <Status r={r} />
              </TableCell>
              {canWrite && (
                <TableCell className="text-right">
                  {r.status === 'ACTIVE' && <WithdrawButton kind="flare-efficiencies" id={r.id} />}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const addButton = (label: string, what: 'composition' | 'efficiency') =>
    canWrite ? (
      <Button
        variant="outline"
        onClick={() => {
          setAdding(what);
        }}
      >
        <Plus aria-hidden />
        {label}
      </Button>
    ) : undefined;

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <SectionHeader
          title="Gas analyses"
          description="Used for composition-based calculations of activity periods starting on or after each analysis's date."
          action={addButton('Record analysis', 'composition')}
        />
        {compositions.isPending ? (
          <TableSkeleton columns={5} rows={2} label="Loading gas analyses" />
        ) : compositions.isError ? (
          <ErrorState
            title="Could not load gas analyses"
            error={compositions.error}
            onRetry={() => void compositions.refetch()}
          />
        ) : compositions.data.length === 0 ? (
          <EmptyState
            title="No gas analysis recorded"
            description="Without one, flaring can only be calculated with the IPCC reference case (labelled Estimated), and venting can't be calculated."
          />
        ) : (
          compositionRows(compositions.data)
        )}
      </div>
      <div className="space-y-3">
        <SectionHeader
          title="Flare efficiency"
          description="Tested or vendor values; without one, a calculation can use the methodology default, labelled Estimated."
          action={addButton('Record efficiency', 'efficiency')}
        />
        {efficiencies.isPending ? (
          <TableSkeleton columns={5} rows={2} label="Loading flare efficiency" />
        ) : efficiencies.isError ? (
          <ErrorState
            title="Could not load flare efficiency"
            error={efficiencies.error}
            onRetry={() => void efficiencies.refetch()}
          />
        ) : efficiencies.data.length === 0 ? (
          <EmptyState title="No flare efficiency recorded" />
        ) : (
          efficiencyRows(efficiencies.data)
        )}
      </div>
      {adding === 'composition' && (
        <CompositionDialog
          sourceId={flareSource.id}
          onClose={() => {
            setAdding(null);
          }}
        />
      )}
      {adding === 'efficiency' && (
        <EfficiencyDialog
          sourceId={flareSource.id}
          onClose={() => {
            setAdding(null);
          }}
        />
      )}
    </section>
  );
}
