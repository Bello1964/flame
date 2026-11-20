import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AlertTriangle, Calculator, Loader2 } from 'lucide-react';
import type { ActivityRecordDto, CalculationRoute, EfficiencySource } from '@flame/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState } from '@/components/page-state';
import { TableSkeleton } from '@/components/skeletons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage, fieldErrorsOf } from '@/lib/api-client';
import { formatDateTime, formatDecimal } from '@/lib/format';
import { SectionHeader } from '@/features/hierarchy/record-detail';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { isFlaring } from '@/features/activity/labels';
import { useRecordCalculations, useRunCalculation } from './api';
import { CalculationStatusBadge, DataQualityBadge } from './badges';
import { missingInputs } from './calculation-config';
import { ROUTE_HINTS, ROUTE_LABELS } from './labels';

const OPEN = ['CALCULATED', 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_APPROVAL'];

function RunDialog({ record, onClose }: { record: ActivityRecordDto; onClose: () => void }) {
  const { organisationId } = useOrganisation();
  const run = useRunCalculation(organisationId, record.id);
  const navigate = useNavigate();
  const flaring = isFlaring(record.activityType);
  const routes: CalculationRoute[] = flaring
    ? ['COMPOSITION_FLARING', 'IPCC_REFERENCE_FLARING']
    : ['COMPOSITION_VENTING'];
  const [route, setRoute] = useState<CalculationRoute>(routes[0] ?? 'COMPOSITION_VENTING');
  const [efficiency, setEfficiency] = useState<EfficiencySource>('FLARE_RECORD');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const name = useId();
  const reasonId = useId();
  const reasonMissing = route === 'IPCC_REFERENCE_FLARING' && reason.trim() === '';
  const missing = missingInputs(run.error);
  const fieldErrors = fieldErrorsOf(run.error);

  const submit = () => {
    setTouched(true);
    if (reasonMissing) return;
    run.mutate(
      {
        route,
        ...(route === 'COMPOSITION_FLARING' ? { efficiencySource: efficiency } : {}),
        ...(route === 'IPCC_REFERENCE_FLARING' ? { fallbackReason: reason.trim() } : {}),
      },
      {
        onSuccess: (calc) => {
          toast.success(
            `Calculated: ${formatDecimal(calc.results.co2eTonnes, 3)} tCO₂e (not yet approved).`,
          );
          void navigate(`/o/${organisationId}/calculations/${calc.id}`);
        },
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !run.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Calculate emissions</DialogTitle>
          <DialogDescription>
            Uses the approved methodology edition. The result records every input and number it
            used, then goes through review and approval. It is an emissions figure, not a carbon
            credit.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Method</legend>
          {routes.map((r) => (
            <label
              key={r}
              className="flex cursor-pointer gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40"
            >
              <input
                type="radio"
                name={name}
                className="mt-1 accent-primary"
                checked={route === r}
                onChange={() => {
                  setRoute(r);
                }}
              />
              <span>
                <span className="block text-sm font-medium">{ROUTE_LABELS[r]}</span>
                <span className="block text-xs text-muted-foreground">{ROUTE_HINTS[r]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {route === 'COMPOSITION_FLARING' && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Flare efficiency</legend>
            {(
              [
                [
                  'FLARE_RECORD',
                  'The flare’s tested or vendor value',
                  'From the flare source’s efficiency records, valid for this period.',
                ],
                [
                  'METHODOLOGY_DEFAULT',
                  'Methodology default (result labelled Estimated)',
                  '98% carbon to CO₂; 2% unburned methane for production flares, 0.5% for refinery flares (API Compendium 2009 §4.6).',
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className="flex cursor-pointer gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40"
              >
                <input
                  type="radio"
                  name={`${name}-eff`}
                  className="mt-1 accent-primary"
                  checked={efficiency === value}
                  onChange={() => {
                    setEfficiency(value);
                  }}
                />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {route === 'IPCC_REFERENCE_FLARING' && (
          <div className="grid gap-1.5">
            <Label htmlFor={reasonId}>
              Why measured composition isn’t used{' '}
              <span className="text-destructive" aria-hidden>
                *
              </span>
            </Label>
            <Textarea
              id={reasonId}
              rows={2}
              value={reason}
              maxLength={2000}
              aria-required
              aria-invalid={touched && reasonMissing}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              onBlur={() => {
                setTouched(true);
              }}
              placeholder="e.g. No gas analysis for this flare in January"
            />
            {((touched && reasonMissing) || fieldErrors['fallbackReason']) && (
              <p className="text-xs font-medium text-destructive">
                {fieldErrors['fallbackReason']?.[0] ?? 'Give a reason'}
              </p>
            )}
          </div>
        )}
        {run.isError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p>{fieldErrors['route']?.[0] ?? errorMessage(run.error)}</p>
              {missing && missing.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-foreground">
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={run.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={run.isPending} onClick={submit}>
            {run.isPending ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Calculator aria-hidden />
            )}
            {run.isPending ? 'Calculating…' : 'Calculate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Emissions calculations of one activity record, newest version first. */
export function CalculationsSection({ record }: { record: ActivityRecordDto }) {
  const organisation = useOrganisation();
  const orgId = organisation.organisationId;
  const relevant = record.status === 'APPROVED' || record.status === 'SUPERSEDED';
  const calcs = useRecordCalculations(orgId, record.id, relevant);
  const [running, setRunning] = useState(false);
  if (!relevant) return null;

  const open = calcs.data?.some((c) => OPEN.includes(c.status)) ?? false;
  // Only once the versions have loaded, so the button never shows beside an open one.
  const canRun =
    calcs.isSuccess &&
    organisation.canRunCalculation &&
    record.status === 'APPROVED' &&
    record.activityType !== 'OTHER_RELEASE' &&
    !open;

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Emissions calculations"
        description="Each version records the methodology edition and every number it used. Only approved calculations count."
        action={
          canRun ? (
            <Button
              onClick={() => {
                setRunning(true);
              }}
            >
              <Calculator aria-hidden />
              Calculate emissions
            </Button>
          ) : undefined
        }
      />
      {record.activityType === 'OTHER_RELEASE' && (
        <p className="text-sm text-muted-foreground">
          No approved methodology covers other gas releases yet, so this record can’t be calculated.
        </p>
      )}
      {open && organisation.canRunCalculation && (
        <p className="text-sm text-muted-foreground">
          A calculation is in progress; finish or discard it before calculating again.
        </p>
      )}
      {calcs.isPending ? (
        <TableSkeleton columns={5} rows={1} label="Loading calculations" />
      ) : calcs.isError ? (
        <ErrorState
          title="Could not load calculations"
          error={calcs.error}
          onRetry={() => void calcs.refetch()}
        />
      ) : calcs.data.length === 0 ? (
        <EmptyState
          title="Not calculated yet"
          description={
            organisation.canRunCalculation
              ? 'Calculate emissions once the gas analysis (and, for flaring, the flare efficiency) is recorded on the flare source.'
              : 'An owner, administrator or data entry officer can calculate emissions.'
          }
        />
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <caption className="sr-only">Calculation versions, newest first.</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Version</TableHead>
                <TableHead className="text-right">tCO₂e</TableHead>
                <TableHead className="hidden md:table-cell">Method</TableHead>
                <TableHead className="hidden sm:table-cell">Basis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Methodology</TableHead>
                <TableHead className="hidden lg:table-cell">Calculated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calcs.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link to={`/o/${orgId}/calculations/${c.id}`} className="row-link">
                      Version {c.version}
                    </Link>
                  </TableCell>
                  <TableCell
                    className="text-right tabular-nums"
                    title={`Exact: ${c.results.co2eTonnes} tCO₂e`}
                  >
                    {formatDecimal(c.results.co2eTonnes, 3)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{ROUTE_LABELS[c.route]}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <DataQualityBadge quality={c.dataQuality} />
                  </TableCell>
                  <TableCell>
                    <CalculationStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Link
                      to={`/o/${orgId}/methodology/editions/${c.edition.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Edition {c.edition.edition}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {formatDateTime(c.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {running && (
        <RunDialog
          record={record}
          onClose={() => {
            setRunning(false);
          }}
        />
      )}
    </section>
  );
}
