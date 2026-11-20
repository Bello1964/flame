import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Download, Info, Loader2 } from 'lucide-react';
import type {
  NuprcCoverageDto,
  NuprcMonthlyLogDto,
  NuprcQuarterlyReportDto,
  NuprcSourceDto,
  UnplacedRecordDto,
} from '@flame/shared';
import { NUPRC_APPENDIX_C_COLUMNS } from '@flame/shared';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api-client';
import { ACTIVITY_TYPE_LABELS } from '@/features/activity/labels';
import { downloadNuprcCsv } from './nuprc-api';

const dash = (v: string | number | null) => (v === null || v === '' ? '—' : String(v));

/** Downloads one CSV (live or issued), with its own pending and error state. */
export function CsvButton({ path, label }: { path: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        downloadNuprcCsv(path)
          .catch((error: unknown) => {
            toast.error(`The CSV couldn’t be downloaded. ${errorMessage(error)}`);
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      {busy ? (
        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        <Download aria-hidden />
      )}
      {label}
    </Button>
  );
}

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SourceNote({ source }: { source: NuprcSourceDto }) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-secondary/40 p-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {source.title}
            </a>
          ) : (
            source.title
          )}
          <span className="font-normal text-muted-foreground"> — {source.issuer}</span>
        </p>
        <p className="text-muted-foreground">{source.note}</p>
      </div>
    </div>
  );
}

function Coverage({
  coverage,
  unplaced,
}: {
  coverage: NuprcCoverageDto;
  unplaced: UnplacedRecordDto[];
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-4">
      {[
        ['Approved records', coverage.approvedRecords],
        ['Approved, no approved calculation', coverage.withoutApprovedCalculation],
        ['Not yet approved (not included)', coverage.awaitingApproval],
        ['Cross the period boundary', unplaced.length],
      ].map(([label, value]) => (
        <div key={String(label)} className="rounded-md border bg-card p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-xl font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Notes({ notes, notRecorded }: { notes: string[]; notRecorded: string[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Notes</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="size-4 text-warning" aria-hidden />
          Not recorded in Flame
        </h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {notRecorded.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{children}</p>
  );
}

/** The quarterly GHG inventory: Appendix C, Appendix A, totals by gas, activity data. */
export function QuarterlyView({
  report,
  downloads,
}: {
  report: NuprcQuarterlyReportDto;
  /** CSV path for each part. */
  downloads: (part: 'appendix-c' | 'appendix-a' | 'gas-totals') => string;
}) {
  return (
    <div className="space-y-8">
      <SourceNote source={report.source} />
      <Coverage coverage={report.coverage} unplaced={report.unplaced} />

      <Section id="appendix-c" title="Appendix C — total emission summary">
        <div className="flex flex-wrap gap-2">
          <CsvButton path={downloads('appendix-c')} label="Appendix C (CSV)" />
        </div>
        {report.appendixC.length === 0 ? (
          <Empty>No approved calculations in this quarter yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {NUPRC_APPENDIX_C_COLUMNS.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.appendixC.map((r) => (
                  <TableRow key={r.serial}>
                    <TableCell>{r.serial}</TableCell>
                    <TableCell>{r.year}</TableCell>
                    <TableCell>{r.month}</TableCell>
                    <TableCell>{r.companyName}</TableCell>
                    <TableCell>{dash(r.companyAbbreviation)}</TableCell>
                    <TableCell>{dash(r.terrain)}</TableCell>
                    <TableCell>{dash(r.concession)}</TableCell>
                    <TableCell>{dash(r.fieldName)}</TableCell>
                    <TableCell>{r.facilityName}</TableCell>
                    <TableCell>{dash(r.facilityType)}</TableCell>
                    <TableCell className="whitespace-nowrap">{dash(r.coordinates)}</TableCell>
                    <TableCell>{dash(r.framework)}</TableCell>
                    <TableCell>{r.emissionSource}</TableCell>
                    <TableCell>{r.equipmentType}</TableCell>
                    <TableCell>{r.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.co2}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.ch4}</TableCell>
                    <TableCell className="text-right tabular-nums">{dash(r.n2o)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{r.total}</TableCell>
                    <TableCell className="min-w-64 text-xs text-muted-foreground">
                      {dash(r.comments)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section id="gas-totals" title="Emissions by gas (tCO₂e)">
        <div className="flex flex-wrap gap-2">
          <CsvButton path={downloads('gas-totals')} label="Totals by gas (CSV)" />
        </div>
        {report.gasTotals.length === 0 ? (
          <Empty>No approved calculations in this quarter yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">CO₂</TableHead>
                  <TableHead className="text-right">CH₄</TableHead>
                  <TableHead className="text-right">N₂O</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Calculations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.gasTotals.map((g) => (
                  <TableRow key={`${g.facilityId}-${g.emissionSource}`}>
                    <TableCell>{g.facilityName}</TableCell>
                    <TableCell>{g.emissionSource}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.co2}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.ch4}</TableCell>
                    <TableCell className="text-right tabular-nums">{dash(g.n2o)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{g.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.calculationCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section id="activity" title="Activity data (MMscf, approved records)">
        {report.activityTotals.length === 0 ? (
          <Empty>No approved activity records in this quarter yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility</TableHead>
                  <TableHead>Activity type</TableHead>
                  <TableHead className="text-right">Approved volume</TableHead>
                  <TableHead className="text-right">Volume with approved calculation</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.activityTotals.map((a) => (
                  <TableRow key={`${a.facilityId}-${a.activityType}`}>
                    <TableCell>{a.facilityName}</TableCell>
                    <TableCell>{ACTIVITY_TYPE_LABELS[a.activityType]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.approvedVolumeMmscf}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.volumeCalculatedMmscf}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.recordCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section id="appendix-a" title="Appendix A — inventory of emission sources">
        <div className="flex flex-wrap gap-2">
          <CsvButton path={downloads('appendix-a')} label="Appendix A (CSV)" />
        </div>
        {report.appendixA.length === 0 ? (
          <Empty>No flaring or venting sources with approved records in this quarter.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    'S/N',
                    'Facility',
                    'Facility type',
                    'Location',
                    'Category',
                    'Equipment/source type',
                    'Quantity',
                    'Segment',
                    'Pollutants',
                    'Quantification method',
                    'Uncertainty',
                  ].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.appendixA.map((r) => (
                  <TableRow key={r.serial}>
                    <TableCell>{r.serial}</TableCell>
                    <TableCell>{r.facilityName}</TableCell>
                    <TableCell>{dash(r.facilityType)}</TableCell>
                    <TableCell>{dash(r.location)}</TableCell>
                    <TableCell>{r.sourceCategory}</TableCell>
                    <TableCell>{r.equipmentType}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                    <TableCell>{dash(r.segment)}</TableCell>
                    <TableCell>{r.pollutants}</TableCell>
                    <TableCell>{r.quantificationMethod}</TableCell>
                    <TableCell>{r.uncertainty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section id="editions" title="Methodology and GWP">
        {report.editions.length === 0 ? (
          <Empty>No methodology edition used yet.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {report.editions.map((e) => (
              <li key={e.id}>
                Edition {e.edition} — {e.title}: GWP CO₂ {dash(e.gwp.co2)}, CH₄ {dash(e.gwp.ch4)},
                N₂O {dash(e.gwp.n2o)} ({e.calculationCount} calculations)
              </li>
            ))}
          </ul>
        )}
        {!report.gwpConsistent && (
          <p role="note" className="text-sm text-warning">
            The editions used have different GWP values.
          </p>
        )}
      </Section>

      <Notes notes={report.notes} notRecorded={report.notRecorded} />
    </div>
  );
}

/** The monthly flare and vent log (regulation 20). */
export function MonthlyView({
  log,
  downloads,
}: {
  log: NuprcMonthlyLogDto;
  downloads: (part: 'entries' | 'totals') => string;
}) {
  return (
    <div className="space-y-8">
      <SourceNote source={log.source} />
      <Coverage coverage={log.coverage} unplaced={log.unplaced} />

      <Section id="totals" title="Monthly totals (MMscf)">
        <div className="flex flex-wrap gap-2">
          <CsvButton path={downloads('totals')} label="Totals (CSV)" />
        </div>
        <p className="text-sm">
          Flared <strong className="tabular-nums">{log.totals.flaredMmscf}</strong> MMscf · Vented{' '}
          <strong className="tabular-nums">{log.totals.ventedMmscf}</strong> MMscf
        </p>
        {log.sourceTotals.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility</TableHead>
                  <TableHead>Flare source</TableHead>
                  <TableHead className="text-right">Flared</TableHead>
                  <TableHead className="text-right">Vented</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.sourceTotals.map((t) => (
                  <TableRow key={t.flareSourceId}>
                    <TableCell>{t.facilityName}</TableCell>
                    <TableCell>
                      {t.flareSourceName}{' '}
                      <span className="text-muted-foreground">({t.flareSourceCode})</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.flaredMmscf}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.ventedMmscf}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section id="entries" title="Log entries">
        <div className="flex flex-wrap gap-2">
          <CsvButton path={downloads('entries')} label="Entries (CSV)" />
        </div>
        {log.entries.length === 0 ? (
          <Empty>No approved flaring or venting records in this month yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    'Facility',
                    'Flare source',
                    'Type',
                    'Dates',
                    'Start time',
                    'Duration (h)',
                    'Rate (MMscf/d)',
                    'Volume (MMscf)',
                    'As entered',
                    'Gas source/type',
                    'Basis',
                    'Spans months',
                    'CH₄ (tCO₂e)',
                  ].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.entries.map((e) => (
                  <TableRow key={e.recordId}>
                    <TableCell>{e.facilityName}</TableCell>
                    <TableCell>{e.flareSourceCode}</TableCell>
                    <TableCell>{ACTIVITY_TYPE_LABELS[e.activityType]}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {e.periodStart === e.periodEnd
                        ? e.periodStart
                        : `${e.periodStart} – ${e.periodEnd}`}
                    </TableCell>
                    <TableCell>{dash(e.startTime)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {dash(e.durationHours)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{dash(e.rateMmscfd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{dash(e.volumeMmscf)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {e.originalVolume
                        ? `${e.originalVolume.value} ${e.originalVolume.unit}`
                        : '—'}
                    </TableCell>
                    <TableCell>{dash(e.gasSource)}</TableCell>
                    <TableCell>
                      {e.measurementBasis === 'MEASURED' ? 'Measured' : 'Estimated'}
                    </TableCell>
                    <TableCell>{e.spansMonths ? 'Yes (not in totals)' : 'No'}</TableCell>
                    <TableCell className="text-right tabular-nums">{dash(e.ch4Co2e)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Notes notes={log.notes} notRecorded={log.notRecorded} />
    </div>
  );
}
