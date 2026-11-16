import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, BookOpen, Info, Loader2 } from 'lucide-react';
import type { CalculationDto, CalculationStepDto } from '@flame/shared';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime, formatDecimal } from '@/lib/format';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { Breadcrumbs, RecordPageState, SectionHeader } from '@/features/hierarchy/record-detail';
import { ActionDialog, ActionError } from '@/features/activity/workflow-actions';
import { ACTIVITY_TYPE_LABELS, periodLabel } from '@/features/activity/labels';
import {
  useCalculation,
  useCalculationAction,
  useCalculationHistory,
} from '@/features/calculations/api';
import { CalculationStatusBadge, DataQualityBadge } from '@/features/calculations/badges';
import {
  CALCULATION_ACTION_CONFIG,
  CALCULATION_ACTION_ORDER,
} from '@/features/calculations/calculation-config';
import {
  CALCULATION_EVENT_LABELS,
  ROUTE_LABELS,
  methodologyLink,
  parameterAnchor,
} from '@/features/calculations/labels';
import type { ActivityType, CalculationAction } from '@flame/shared';

/** What the result can be used for, by status (never implying approval it doesn't have). */
const RESULT_STATUS: Record<CalculationDto['status'], string> = {
  CALCULATED: 'Not approved: not for official reporting yet.',
  SUBMITTED: 'Not approved: waiting for review.',
  UNDER_REVIEW: 'Not approved: under review.',
  AWAITING_APPROVAL: 'Not approved: reviewed, waiting for approval.',
  APPROVED: 'Approved: the result for this activity record.',
  REJECTED: 'Rejected: not used. Kept for history.',
  SUPERSEDED: 'Superseded by a newer approved version: no longer used. Kept for history.',
  DISCARDED: 'Discarded before review: not used. Kept for history.',
};

function Tonnes({
  label,
  value,
  unit = 't',
}: {
  label: string;
  value: string | null;
  unit?: string;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className="mt-1 text-xl font-semibold tabular-nums"
        title={value ? `Exact: ${value} ${unit}` : undefined}
      >
        {value === null ? (
          <span className="text-base font-normal text-muted-foreground">Not applicable</span>
        ) : (
          <>
            {formatDecimal(value, 6)}{' '}
            <span className="text-sm font-normal text-muted-foreground">{unit}</span>
          </>
        )}
      </dd>
    </div>
  );
}

function Actions({ calc }: { calc: CalculationDto }) {
  const { organisationId } = useOrganisation();
  const mutation = useCalculationAction(organisationId, calc.id);
  const [open, setOpen] = useState<CalculationAction | null>(null);
  const actions = CALCULATION_ACTION_ORDER.filter((a) => calc.availableActions.includes(a));
  if (actions.length === 0) return null;

  const run = (action: CalculationAction, comment?: string) => {
    mutation.mutate(
      { action, ...(comment ? { comment } : {}) },
      {
        onSuccess: () => {
          toast.success(CALCULATION_ACTION_CONFIG[action].done);
          setOpen(null);
        },
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const config = CALCULATION_ACTION_CONFIG[a];
          const Icon = config.icon;
          return (
            <Button
              key={a}
              variant={config.tone === 'primary' ? 'default' : 'outline'}
              className={
                config.tone === 'destructive'
                  ? 'text-destructive hover:text-destructive'
                  : undefined
              }
              disabled={mutation.isPending}
              onClick={() => {
                mutation.reset();
                if (config.dialog) setOpen(a);
                else run(a);
              }}
            >
              {mutation.isPending && mutation.variables.action === a && !config.dialog ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Icon aria-hidden />
              )}
              {config.label}
            </Button>
          );
        })}
      </div>
      {open === null && mutation.isError && <ActionError error={mutation.error} />}
      {open !== null && (
        <ActionDialog
          config={CALCULATION_ACTION_CONFIG[open]}
          pending={mutation.isPending}
          error={mutation.error}
          onCancel={() => {
            setOpen(null);
          }}
          onConfirm={(comment) => {
            run(open, comment);
          }}
        />
      )}
    </div>
  );
}

function Step({
  step,
  index,
  editionId,
}: {
  step: CalculationStepDto;
  index: number;
  editionId: string;
}) {
  return (
    <li className="rounded-md border bg-card p-4">
      <h3 className="font-medium">
        {index + 1}. {step.title}
      </h3>
      <code className="mt-2 block max-w-full overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-sm whitespace-nowrap">
        {step.formula}
      </code>
      <code className="mt-1 block max-w-full overflow-x-auto rounded px-2 py-1 font-mono text-xs whitespace-nowrap text-muted-foreground">
        {step.substituted}
      </code>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Values used in this step and where each came from</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Symbol</th>
              <th className="py-1 pr-3 font-medium">Value</th>
              <th className="py-1 font-medium">From</th>
            </tr>
          </thead>
          <tbody>
            {step.values.map((v) => (
              <tr key={`${v.symbol}-${v.label}`} className="border-t align-top">
                <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">{v.symbol}</td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {v.value} <span className="text-muted-foreground">{v.unit}</span>
                </td>
                <td className="py-1.5">
                  {v.parameterKey ? (
                    <Link
                      to={methodologyLink(editionId, parameterAnchor(v.parameterKey))}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {v.label}
                    </Link>
                  ) : (
                    <span>
                      {v.label}
                      {v.origin && (
                        <span className="block text-xs text-muted-foreground">{v.origin}</span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">
        Result:{' '}
        <span className="font-semibold tabular-nums">
          {step.result.symbol} = {step.result.value} {step.result.unit}
        </span>
      </p>
    </li>
  );
}

function History({ calcId }: { calcId: string }) {
  const { organisationId } = useOrganisation();
  const history = useCalculationHistory(organisationId, calcId);
  if (history.isPending) return <Skeleton className="h-16 w-full" />;
  if (history.isError)
    return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  return (
    <ol className="space-y-3 rounded-md border bg-card p-4" aria-label="Calculation history">
      {history.data.map((e) => (
        <li key={e.id} className="text-sm">
          <span className="font-medium">{CALCULATION_EVENT_LABELS[e.type]}</span>{' '}
          <span className="text-muted-foreground">by {e.actor.name}</span>{' '}
          <time className="text-xs text-muted-foreground" dateTime={e.createdAt}>
            {formatDateTime(e.createdAt)}
          </time>
          {e.comment && (
            <blockquote className="mt-1 border-l-2 border-border pl-3 whitespace-pre-line">
              {e.comment}
            </blockquote>
          )}
          {e.relatedCalculationId && (
            <Link
              to={`/o/${organisationId}/calculations/${e.relatedCalculationId}`}
              className="mt-1 block text-primary underline-offset-4 hover:underline"
            >
              Open the newer approved version
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}

interface Snapshot {
  activity?: { volumeMmscf: string; volumeOrigin: string; measurementBasis: string };
  composition?: { sampleReference: string; sampleDate: string; validFrom: string } | null;
  efficiency?: {
    co2ConversionPercent: string;
    uncombustedMethanePercent: string;
    origin: string;
  } | null;
}

/**
 * /o/:organisationId/calculations/:calculationId: the result, how it was obtained, and
 * every step with the numbers used and where each came from. Always available, for every
 * version, with a link to the exact methodology edition it used.
 */
export function CalculationPage() {
  const { calculationId } = useParams();
  const { organisationId } = useOrganisation();
  const base = `/o/${organisationId}`;
  const calc = useCalculation(organisationId, calculationId);

  if (!calc.data) {
    return (
      <RecordPageState
        error={calc.error}
        label="calculation"
        backTo={`${base}/facilities`}
        backLabel="Back to facilities"
        onRetry={() => void calc.refetch()}
      />
    );
  }
  const c = calc.data;
  const inputs = c.inputs as Snapshot;
  const period = periodLabel({
    kind: c.activity.kind,
    periodStart: c.activity.periodStart,
    periodEnd: c.activity.periodEnd,
  });

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Facilities', to: `${base}/facilities` },
            { label: c.flareSource.name, to: `${base}/flare-sources/${c.flareSource.id}` },
            { label: period, to: `${base}/activity-records/${c.activityRecordId}` },
            { label: `Calculation v${String(c.version)}` },
          ]}
        />
        <header className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Emissions calculation · Version {c.version}
          </p>
          <h1 className="text-2xl font-semibold">
            {period}: {c.flareSource.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <CalculationStatusBadge status={c.status} />
            <DataQualityBadge quality={c.dataQuality} />
            <span className="text-sm text-muted-foreground">
              {ACTIVITY_TYPE_LABELS[c.activity.activityType as ActivityType]} ·{' '}
              {ROUTE_LABELS[c.route]}
            </span>
          </div>
        </header>
        {c.activityRevised && (
          <p className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            The activity record was revised after this calculation. Recalculate the approved
            revision; this result is kept for history.
          </p>
        )}
        {c.claim && (
          <p className="text-sm text-muted-foreground">
            Being reviewed by {c.claim.byName} since {formatDateTime(c.claim.at)}.
          </p>
        )}
        {c.approval && (
          <p className="text-sm text-muted-foreground">
            Approved by {c.approval.byName} on {formatDateTime(c.approval.at)}.
          </p>
        )}
        {c.separationOfDuties && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {c.separationOfDuties}.
          </p>
        )}
        <Actions calc={c} />
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Result"
          description={`${RESULT_STATUS[c.status]} Emissions, not carbon credits.`}
        />
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-primary/30 bg-accent/40 p-4 sm:col-span-2 lg:col-span-1">
            <dt className="text-sm text-muted-foreground">Total</dt>
            <dd
              className="mt-1 text-2xl font-semibold tabular-nums"
              title={`Exact: ${c.results.co2eTonnes} tCO₂e`}
            >
              {formatDecimal(c.results.co2eTonnes, 3)}{' '}
              <span className="text-base font-normal">tCO₂e</span>
            </dd>
          </div>
          <Tonnes label="Carbon dioxide (CO₂)" value={c.results.co2Tonnes} />
          <Tonnes label="Methane (CH₄)" value={c.results.ch4Tonnes} />
          <Tonnes label="Nitrous oxide (N₂O)" value={c.results.n2oTonnes} />
        </dl>
        <p className="text-sm text-muted-foreground">
          tCO₂e uses 100-year GWPs CO₂ {c.results.gwp.co2}, CH₄ {c.results.gwp.ch4}
          {c.results.gwp.n2o ? `, N₂O ${c.results.gwp.n2o}` : ''} ({c.results.gwp.source}). Hover a
          value for its exact figure.
        </p>
        {c.qualityReasons.length > 0 && (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
            <p className="font-medium">Why this result is estimated</p>
            <ul className="mt-1 list-disc pl-5">
              {c.qualityReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Inputs"
          description="As they were when the calculation ran; later changes don’t affect it."
        />
        <dl className="grid gap-x-8 gap-y-4 rounded-md border bg-card p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Gas volume</dt>
            <dd className="text-sm">
              {inputs.activity?.volumeMmscf} MMscf at 15 °C, 101.325 kPa (
              {formatDecimal(c.volumeM3, 3)} m³)
              <span className="block text-xs text-muted-foreground">
                {inputs.activity?.volumeOrigin}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Activity record</dt>
            <dd className="text-sm">
              <Link
                to={`${base}/activity-records/${c.activityRecordId}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {period}
              </Link>{' '}
              ({inputs.activity?.measurementBasis === 'ESTIMATED' ? 'estimated' : 'measured'})
            </dd>
          </div>
          {inputs.composition && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Gas analysis</dt>
              <dd className="text-sm">
                {inputs.composition.sampleReference}, sampled{' '}
                {formatDate(inputs.composition.sampleDate)}
              </dd>
            </div>
          )}
          {inputs.efficiency && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Flare efficiency</dt>
              <dd className="text-sm">
                {inputs.efficiency.co2ConversionPercent}% to CO₂,{' '}
                {inputs.efficiency.uncombustedMethanePercent}% unburned CH₄
                <span className="block text-xs text-muted-foreground">
                  {inputs.efficiency.origin}
                </span>
              </dd>
            </div>
          )}
          {c.fallbackReason && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">
                Why the IPCC reference case was used
              </dt>
              <dd className="text-sm">{c.fallbackReason}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-muted-foreground">Methodology</dt>
            <dd className="text-sm">
              <Link
                to={methodologyLink(c.edition.id)}
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                <BookOpen className="size-4" aria-hidden />
                {c.edition.title}, edition {c.edition.edition}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
              <span className="block text-xs text-muted-foreground">
                The decisions, reasons and sources behind every number below. Engine{' '}
                {c.engineVersion}.
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Step-by-step calculation"
          description="Each formula with the numbers used. Calculated at 40 significant digits; shown to 20 decimal places."
        />
        <ol className="space-y-3">
          {c.steps.map((s, i) => (
            <Step key={s.key} step={s} index={i} editionId={c.edition.id} />
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="History"
          description="Every step and comment, oldest first. Nothing here can be changed."
        />
        <History calcId={c.id} />
      </section>
    </div>
  );
}
