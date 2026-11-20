import type { ReactNode } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import type {
  MethodologyDecision,
  MethodologyEditionDto,
  MethodologyParameterDto,
  MethodologyReference,
} from '@flame/shared';
import { formatDate, formatDateTime } from '@/lib/format';
import { EditionStatusBadge } from '@/features/calculations/badges';
import {
  PARAMETER_KIND_LABELS,
  PARAMETER_KIND_ORDER,
  ROUTE_LABELS,
  decisionAnchor,
  parameterAnchor,
} from '@/features/calculations/labels';

function Reference({ r }: { r: MethodologyReference }) {
  return (
    <li className="text-sm">
      {r.url ? (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-start gap-1 text-primary underline-offset-4 hover:underline"
        >
          {r.label}
          <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-label="(opens in a new tab)" />
        </a>
      ) : (
        <span>{r.label}</span>
      )}
      <span className="text-muted-foreground">: {r.location}</span>
    </li>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-4">
      <h2 id={`${id}-title`} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Decision({ d, action }: { d: MethodologyDecision; action?: ReactNode }) {
  return (
    <article
      id={decisionAnchor(d.key)}
      className="scroll-mt-20 rounded-md border bg-card p-4 target:ring-2 target:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{d.title}</h3>
        {action}
      </div>
      <dl className="mt-3 grid gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Decision
          </dt>
          <dd className="mt-0.5">{d.decision}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Why</dt>
          <dd className="mt-0.5">{d.reason}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            References
          </dt>
          <dd className="mt-1">
            <ul className="space-y-1">
              {d.references.map((r) => (
                <Reference key={`${r.label}-${r.location}`} r={r} />
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </article>
  );
}

function Parameter({ p, action }: { p: MethodologyParameterDto; action?: ReactNode }) {
  return (
    <article
      id={parameterAnchor(p.key)}
      className="scroll-mt-20 rounded-md border bg-card p-4 target:ring-2 target:ring-ring"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-medium">{p.name}</h4>
          <p className="font-mono text-xs text-muted-foreground">{p.key}</p>
        </div>
        <div className="flex items-start gap-2">
          <p className="text-right text-lg font-semibold tabular-nums">
            {p.value} <span className="text-sm font-normal text-muted-foreground">{p.unit}</span>
          </p>
          {action}
        </div>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-muted-foreground">Used for</dt>
          <dd>{p.appliesTo}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-muted-foreground">Source</dt>
          <dd>
            {p.sourceOrganisation}, <cite>{p.sourceDocument}</cite> ({p.sourceEdition}),{' '}
            {p.sourceLocation}
            {p.sourceUrl && (
              <>
                {' '}
                <a
                  href={p.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                >
                  Open the source
                  <ExternalLink className="size-3.5" aria-label="(opens in a new tab)" />
                </a>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Checked against the source</dt>
          <dd>{formatDate(p.retrievedOn)}</dd>
        </div>
        {p.notes && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-muted-foreground">Notes</dt>
            <dd>{p.notes}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

/**
 * One edition of the calculation methodology, in full: what is calculated and how, every
 * decision with its reason and references, and every number with its source. Anchors
 * (#decision-…, #param-…) let a calculation's trace link to the exact rule or number.
 */
export function EditionView({
  edition,
  parameterAction,
  decisionAction,
  routeAction,
  notice,
}: {
  edition: MethodologyEditionDto;
  parameterAction?: (p: MethodologyParameterDto) => ReactNode;
  decisionAction?: (d: MethodologyDecision, index: number) => ReactNode;
  /** Rendered beside each route, e.g. an edit button for its reporting tier. */
  routeAction?: (index: number) => ReactNode;
  notice?: ReactNode;
}) {
  const c = edition.content;
  const byKind = PARAMETER_KIND_ORDER.map((kind) => ({
    kind,
    items: edition.parameters.filter((p) => p.kind === kind),
  })).filter((g) => g.items.length > 0);
  const toc = [
    ['overview', 'Overview'],
    ['routes', 'How each result is calculated'],
    ['decisions', `Decisions and reasons (${String(c.decisions.length)})`],
    ['numbers', `Numbers used (${String(edition.parameters.length)})`],
    ['limitations', 'Limitations'],
  ] as const;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Calculation methodology · Edition {edition.edition}
        </p>
        <h1 className="text-2xl font-semibold text-balance sm:text-3xl">{edition.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <EditionStatusBadge status={edition.status} />
          {edition.approvedAt && (
            <span>
              Approved {formatDateTime(edition.approvedAt)}
              {edition.approvedBy ? ` by ${edition.approvedBy.name}` : ''}
            </span>
          )}
          {edition.supersededAt && <span>· Superseded {formatDateTime(edition.supersededAt)}</span>}
        </div>
        <p className="max-w-3xl text-muted-foreground">{edition.summary}</p>
        {notice}
        {edition.provenance && (
          <p className="flex max-w-3xl items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {edition.provenance}
          </p>
        )}
        <nav aria-label="On this page" className="rounded-md border bg-muted/30 p-4">
          <p className="text-sm font-medium">On this page</p>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {toc.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-primary underline-offset-4 hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <Section id="overview" title="Overview">
        <div className="max-w-3xl space-y-3">
          {c.overview.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </Section>

      <Section id="routes" title="How each result is calculated">
        <div className="space-y-6">
          {c.routes.map((route, routeIndex) => (
            <article key={route.key} className="rounded-md border bg-card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold">{route.title || ROUTE_LABELS[route.key]}</h3>
                {routeAction?.(routeIndex)}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Applies to: {route.appliesTo}</p>
              <p className="mt-1 text-sm">
                <span className="font-medium">Regulatory reporting tier: </span>
                {route.reportingTier ? (
                  <>
                    {route.reportingTier.label}{' '}
                    <span className="text-muted-foreground">
                      ({route.reportingTier.reference.label},{' '}
                      {route.reportingTier.reference.location})
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    not set in this edition (NUPRC reports show it as not set)
                  </span>
                )}
              </p>
              {route.requires.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium">Needs</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                    {route.requires.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ol className="mt-4 space-y-4">
                {route.steps.map((step, i) => (
                  <li key={step.key} className="grid gap-1 border-l-2 border-border pl-4">
                    <p className="text-sm font-medium">
                      {i + 1}. {step.title}
                    </p>
                    <code className="w-fit max-w-full overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-sm whitespace-nowrap">
                      {step.formula}
                    </code>
                    <p className="text-sm text-muted-foreground">{step.explanation}</p>
                    {step.parameters.length > 0 && (
                      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">Numbers:</span>
                        {step.parameters.map((k) => (
                          <a
                            key={k}
                            href={`#${parameterAnchor(k)}`}
                            className="font-mono text-primary underline-offset-4 hover:underline"
                          >
                            {k}
                          </a>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </Section>

      <Section id="decisions" title="Decisions and reasons">
        <div className="grid gap-4">
          {c.decisions.map((d, i) => (
            <Decision key={d.key} d={d} action={decisionAction?.(d, i)} />
          ))}
        </div>
      </Section>

      <Section id="numbers" title="Numbers used">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every number a calculation uses, with the document, edition and page it comes from. A
          calculation records this edition, so its numbers never change after the fact.
        </p>
        <div className="space-y-8">
          {byKind.map((g) => (
            <div key={g.kind} className="space-y-3">
              <h3 className="text-lg font-semibold">{PARAMETER_KIND_LABELS[g.kind]}</h3>
              <div className="grid gap-3">
                {g.items.map((p) => (
                  <Parameter key={p.key} p={p} action={parameterAction?.(p)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="limitations" title="Limitations">
        <ul className="max-w-3xl list-disc space-y-1 pl-5">
          {c.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
