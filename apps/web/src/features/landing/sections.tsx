import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { ArrowUpRight, CircleCheck, CircleDashed, Mail, Plus } from 'lucide-react';
import { BrandLockup } from '@/components/brand';
import { Button } from '@/components/ui/button';
import flaresAmongPalms from '@/assets/landing/webpic.jpg';
import { PrimaryAction } from './primary-action';
import { Reveal } from './reveal';
import { GHOST_ON_DARK, WRAP } from './styles';
import { cn } from '@/lib/utils';
import { CONTACT_EMAIL, PRODUCT_NAME } from '@/lib/brand';

/*
 * The public homepage below the hero. Every claim here describes what the product does
 * today (checked against the code); what is not built yet is said plainly. No customers,
 * results, certifications or partnerships are claimed.
 */

function Eyebrow({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <p className={cn('eyebrow', tone === 'light' ? 'text-oxide' : 'text-patina-on-dark')}>
      {children}
    </p>
  );
}

function DisplayHeading({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={cn(
        'mt-5 font-display text-display-sm tracking-[-0.01em] text-balance md:text-display',
        className,
      )}
    >
      {children}
    </h2>
  );
}

// ─── The problem ─────────────────────────────────────────────────────────────

const LEDGER = [
  {
    title: 'Recorded as measured',
    text: 'The original value, unit and reference condition stay beside the standardised one. Measured and estimated values are kept apart, and an estimate needs an explanation.',
  },
  {
    title: 'Calculated, never overwritten',
    text: 'Each tCO2e result names its methodology edition, factors and GWP source. Recalculating creates a new version; the old one stays.',
  },
  {
    title: 'Approved by someone else',
    text: 'Submission, review and approval with separation of duties. Only approved records and calculations reach official reports.',
  },
  {
    title: 'Reported in the regulator’s layout',
    text: 'NUPRC’s quarterly GHG inventory and the monthly flare and vent log, issued as frozen, versioned snapshots.',
  },
];

export function Problem() {
  return (
    <section
      id="platform"
      aria-labelledby="platform-heading"
      className="scroll-mt-4 bg-limestone text-basalt"
    >
      <div className={cn(WRAP, 'grid gap-14 py-24 md:py-32 lg:grid-cols-[5fr_7fr] lg:gap-24')}>
        <Reveal>
          <Eyebrow>The problem</Eyebrow>
          <DisplayHeading id="platform-heading">
            A figure nobody can trace is a figure nobody should sign.
          </DisplayHeading>
        </Reveal>
        <Reveal delay={120}>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Flaring figures usually travel through spreadsheets. Units change, reference conditions
            disappear, a 24-hour day is assumed and a factor is pasted in without a source. By the
            time a total reaches a regulator, nobody can say where it came from. {PRODUCT_NAME}{' '}
            keeps the whole path.
          </p>
          <ol className="mt-12 border-t border-basalt">
            {LEDGER.map((row, i) => (
              <li
                key={row.title}
                className="grid gap-2 border-b border-stone-line py-6 sm:grid-cols-[3rem_14rem_1fr] sm:gap-6"
              >
                <span className="figure text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="font-semibold">{row.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{row.text}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

// ─── How it works ────────────────────────────────────────────────────────────

const STAGES: { title: string; text: string; built: boolean }[] = [
  {
    title: 'Operational hierarchy',
    text: 'Organisations, facilities, assets and flare sources, each with its own history. Every facility keeps its own time zone.',
    built: true,
  },
  {
    title: 'Gas activity data',
    text: 'Daily and reporting-period records for routine, non-routine and emergency flaring, venting and other releases, in MMscf/d or MMscf.',
    built: true,
  },
  {
    title: 'Validation',
    text: 'Overlaps, rate-versus-volume mismatches and missing inputs flagged as data-quality warnings, never hidden.',
    built: true,
  },
  {
    title: 'Gas analysis and flare efficiency',
    text: 'Composition by component and combustion efficiency, each with its source and the date it applies from.',
    built: true,
  },
  {
    title: 'Emissions calculation',
    text: 'CO₂, CH₄ and N₂O, then tCO2e, from an approved methodology edition. Missing inputs stop the calculation.',
    built: true,
  },
  {
    title: 'Review and approval',
    text: 'A reviewer, then an approver, and nobody approves their own work.',
    built: true,
  },
  {
    title: 'Reporting',
    text: 'Monthly, quarterly and annual totals from approved calculations only, as a chart, a table, a CSV or print.',
    built: true,
  },
  {
    title: 'Supporting evidence',
    text: 'Meter certificates and lab reports attached to records. Records are flagged “no evidence” until then.',
    built: false,
  },
  {
    title: 'Mitigation tracking',
    text: 'Reduction initiatives measured against the approved baseline.',
    built: false,
  },
];

export function Workflow() {
  return (
    <section
      id="workflow"
      aria-labelledby="workflow-heading"
      className="scroll-mt-4 border-t border-stone-line bg-limestone text-basalt"
    >
      <div className={cn(WRAP, 'grid gap-14 py-24 md:py-32 lg:grid-cols-[4fr_8fr] lg:gap-24')}>
        <Reveal className="lg:sticky lg:top-12 lg:self-start">
          <Eyebrow>How it works</Eyebrow>
          <DisplayHeading id="workflow-heading">
            From flare source to reported emissions, one step at a time.
          </DisplayHeading>
          <p className="mt-6 max-w-md leading-relaxed text-muted-foreground">
            Each stage builds on the one before it. Here is exactly what is available today, and
            what is not built yet.
          </p>
        </Reveal>
        <ol className="border-t border-basalt">
          {STAGES.map((stage, i) => (
            <Reveal
              as="li"
              key={stage.title}
              delay={Math.min(i, 4) * 40}
              className={cn(
                'grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-1 border-b border-stone-line py-5 sm:grid-cols-[3rem_1fr_9rem] sm:gap-x-6',
                !stage.built && 'text-muted-foreground',
              )}
            >
              <span className="figure pt-0.5 text-xs text-muted-foreground">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className={cn('font-semibold', stage.built && 'text-basalt')}>{stage.title}</h3>
                <p className="mt-1 max-w-xl text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {stage.text}
                </p>
              </div>
              <p
                className={cn(
                  'col-start-2 inline-flex items-center gap-1.5 text-xs font-medium sm:col-start-3 sm:justify-end sm:pt-0.5',
                  stage.built ? 'text-success' : 'text-muted-foreground',
                )}
              >
                {stage.built ? (
                  <CircleCheck className="size-3.5" aria-hidden />
                ) : (
                  <CircleDashed className="size-3.5" aria-hidden />
                )}
                {stage.built ? 'Available' : 'Not yet built'}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ─── The calculation, shown ──────────────────────────────────────────────────

const TRACE: { step: string; detail: string; key?: boolean }[] = [
  {
    step: 'Reading as entered',
    detail: 'value · unit · reference condition · measured or estimated',
  },
  { step: 'Standardised', detail: 'ISO 13443, 15 °C and 101.325 kPa, with a real-gas correction' },
  { step: 'Gas analysis', detail: 'composition by component, its sample and source' },
  { step: 'Flare efficiency', detail: 'combustion efficiency and unburned methane, with source' },
  { step: 'Each formula', detail: 'with the numbers used, at 40 significant digits' },
  { step: 'CO₂ · CH₄ · N₂O', detail: 'tonnes of each gas, kept separately' },
  { step: '100-year GWPs', detail: 'the values applied and their published source' },
  { step: 'tCO2e', detail: 'the result, with its version and methodology edition', key: true },
];

export function Trace() {
  return (
    <section aria-labelledby="trace-heading" className="bg-deep text-limestone">
      <div className={cn(WRAP, 'grid gap-14 py-24 md:py-32 lg:grid-cols-[5fr_6fr] lg:gap-24')}>
        <Reveal>
          <Eyebrow tone="dark">Calculation integrity</Eyebrow>
          <DisplayHeading id="trace-heading">
            Every tonne carries the path that produced it.
          </DisplayHeading>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-light">
            Open any calculation and read it end to end: what was measured, how it was converted,
            which factors and GWP values were used and where they come from. The methodology itself
            is public.
          </p>
          <Link
            to="/methodology"
            className="mt-8 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-oxide-on-dark underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-oxide-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-deep"
          >
            Read the published methodology
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </Reveal>
        <Reveal delay={120}>
          <ol aria-label="What each calculation records" className="relative">
            {TRACE.map((t, i) => (
              <li
                key={t.step}
                className="relative grid grid-cols-[1.5rem_1fr] gap-x-4 pb-7 last:pb-0"
              >
                {i < TRACE.length - 1 && (
                  <span
                    className="absolute top-3 bottom-0 left-[0.6875rem] w-px bg-dark-line"
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    'relative mt-1.5 size-[0.4375rem] justify-self-center rounded-full',
                    t.key ? 'size-2.5 bg-flare' : 'bg-patina-on-dark',
                  )}
                  aria-hidden
                />
                <div>
                  <p className={cn('font-mono text-sm', t.key ? 'text-flare' : 'text-limestone')}>
                    {t.step}
                  </p>
                  <p className="mt-1 text-sm text-muted-light">{t.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Integrity ───────────────────────────────────────────────────────────────

const REFUSALS = [
  {
    title: 'Never treats venting as flaring',
    text: 'Flaring burns gas; venting releases it. They are separate record types with separate methodologies, compared and reported separately.',
  },
  {
    title: 'Never assumes a 24-hour day',
    text: 'A volume is derived from a rate only with the operating hours you recorded.',
  },
  {
    title: 'Never invents a conversion or a factor',
    text: 'Off the standard condition, both compressibility factors are required. Calculations use only approved, sourced, versioned factors, or do not run.',
  },
  {
    title: 'Never lets you approve your own work',
    text: 'Whoever entered, edited, submitted or reviewed a record cannot approve it. Every change is attributed in an append-only audit trail.',
  },
];

export function Integrity() {
  return (
    <section
      id="integrity"
      aria-labelledby="integrity-heading"
      className="scroll-mt-4 bg-basalt text-limestone"
    >
      <div className={cn(WRAP, 'grid gap-14 py-24 md:py-32 lg:grid-cols-[5fr_7fr] lg:gap-24')}>
        <Reveal>
          <Eyebrow tone="dark">Built for integrity</Eyebrow>
          <DisplayHeading id="integrity-heading">
            The shortcuts {PRODUCT_NAME} refuses to take.
          </DisplayHeading>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-light">
            The rules are enforced in the software and again in the database, not left to good
            intentions. Each organisation sees only its own data.
          </p>
        </Reveal>
        <ul className="border-t border-dark-line">
          {REFUSALS.map(({ title, text }, i) => (
            <Reveal
              as="li"
              key={title}
              delay={i * 60}
              className="grid grid-cols-[2rem_1fr] gap-4 border-b border-dark-line py-6"
            >
              <span className="mt-3 h-0.5 w-5 bg-oxide-on-dark" aria-hidden />
              <div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 leading-relaxed text-muted-light">{text}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── Reporting ───────────────────────────────────────────────────────────────

export function Reporting() {
  return (
    <section
      id="reporting"
      aria-labelledby="reporting-heading"
      className="scroll-mt-4 bg-limestone text-basalt"
    >
      <div className={cn(WRAP, 'py-24 md:py-32')}>
        <Reveal className="max-w-3xl">
          <Eyebrow>Reporting</Eyebrow>
          <DisplayHeading id="reporting-heading">
            Reports built only from what has been approved.
          </DisplayHeading>
        </Reveal>
        <div className="mt-16 grid gap-px border border-stone-line bg-stone-line md:grid-cols-2">
          <Reveal className="bg-limestone p-6 sm:p-10">
            <p className="figure text-xs text-muted-foreground">01 · Emissions</p>
            <h3 className="mt-4 text-xl font-semibold">Monthly, quarterly and annual totals</h3>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              Approved tCO2e by month and activity type, as a chart and a table, with estimated
              figures marked. Download a CSV or print the report.
            </p>
          </Reveal>
          <Reveal delay={100} className="bg-limestone p-6 sm:p-10">
            <p className="figure text-xs text-muted-foreground">02 · NUPRC</p>
            <h3 className="mt-4 text-xl font-semibold">The regulator’s own layouts</h3>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              The quarterly GHG inventory (Appendix C, as CSV) and the monthly flare and vent log
              following Regulation 20. Issue a frozen snapshot, have a different Owner or Approver
              approve it, and record when and how you submitted it.
            </p>
          </Reveal>
        </div>
        <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
          {PRODUCT_NAME} prepares the figures; you submit them. It does not submit to NUPRC on your
          behalf and does not claim regulatory compliance or independent verification.
        </p>
      </div>
    </section>
  );
}

// ─── Questions ───────────────────────────────────────────────────────────────

const QUESTIONS: { q: string; a: ReactNode }[] = [
  {
    q: 'Is a tonne of CO2e a carbon credit?',
    a: (
      <>
        No. Calculating tCO2e does not create or issue carbon credits, and {PRODUCT_NAME} does not
        verify or certify them. A marketplace for credits issued by recognised external programmes
        is a possible future module, separate from emissions accounting.
      </>
    ),
  },
  {
    q: 'Which emission factors and GWP values does it use?',
    a: (
      <>
        Only those in an approved methodology edition, each with its source. Every published edition
        is public:{' '}
        <Link to="/methodology" className="font-medium text-oxide underline underline-offset-4">
          read the methodology
        </Link>
        .
      </>
    ),
  },
  {
    q: 'How does data get in?',
    a: 'Today, by manual entry, record by record. The data model is designed for meter, sensor and operational-system integrations later; none is available yet.',
  },
  {
    q: 'Who can see our data?',
    a: 'Only members of your organisation, with roles that decide who can record, review, approve and manage. Isolation is enforced on every request and again by the database itself.',
  },
  {
    q: 'Can it connect to our own systems?',
    a: (
      <>
        There is a documented REST API:{' '}
        <Link to="/docs" className="font-medium text-oxide underline underline-offset-4">
          read the API reference
        </Link>
        .
      </>
    ),
  },
];

export function Questions() {
  return (
    <section
      id="questions"
      aria-labelledby="questions-heading"
      className="scroll-mt-4 border-t border-stone-line bg-limestone text-basalt"
    >
      <div
        className={cn(WRAP, 'grid gap-14 pt-24 pb-24 md:pt-32 lg:grid-cols-[4fr_8fr] lg:gap-24')}
      >
        <Reveal>
          <Eyebrow>Questions</Eyebrow>
          <DisplayHeading id="questions-heading">What people ask first.</DisplayHeading>
        </Reveal>
        <div className="border-t border-basalt">
          {QUESTIONS.map(({ q, a }) => (
            <details key={q} className="group border-b border-stone-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-sm py-5 text-lg font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {q}
                <Plus
                  className="size-5 shrink-0 text-oxide transition-transform duration-200 group-open:rotate-45"
                  aria-hidden
                />
              </summary>
              <p className="max-w-2xl pb-6 leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Photograph ──────────────────────────────────────────────────────────────

/**
 * A full-bleed photograph between the editorial sections: flare stacks rising above oil
 * palms. Graded only lightly (a little colour and lift taken out) so the flames, the one
 * warm light in the frame, stay visible. Supplied by the product owner.
 */
export function PhotoBand() {
  return (
    <figure className="bg-limestone">
      <Reveal>
        <img
          src={flaresAmongPalms}
          alt="Gas flare stacks burning above a stand of oil palms under a pale evening sky"
          loading="lazy"
          decoding="async"
          width={1280}
          height={964}
          className="block h-[clamp(20rem,58vw,44rem)] w-full object-cover object-[28%_78%] brightness-[0.94] contrast-[1.06] saturate-[0.7]"
        />
      </Reveal>
      <figcaption
        className={cn(
          WRAP,
          'flex flex-col gap-3 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-10',
        )}
      >
        <span className="eyebrow text-muted-foreground">Flare stacks above oil palms</span>
        <span className="max-w-xl font-display text-2xl leading-snug text-basalt sm:text-right">
          Each of these is a flare source. Each deserves a record that holds up.
        </span>
      </figcaption>
    </figure>
  );
}

// ─── Closing call to action and footer ───────────────────────────────────────

export function ClosingCta() {
  return (
    <section aria-labelledby="cta-heading" className="bg-basalt text-limestone">
      <div className={cn(WRAP, 'py-28 md:py-40')}>
        <Reveal className="max-w-3xl">
          <h2
            id="cta-heading"
            className="font-display text-display-sm tracking-[-0.01em] text-balance md:text-display-lg"
          >
            Bring your flare data into one accountable record.
          </h2>
          <p className="mt-6 max-w-xl text-lg text-muted-light">
            {PRODUCT_NAME} is available by invitation while it grows. Sign in to get started, or
            tell us about your operations.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <PrimaryAction />
            <Button asChild size="lg" variant="outline" className={GHOST_ON_DARK}>
              <a href={`mailto:${CONTACT_EMAIL}?subject=Flame`}>
                <Mail aria-hidden />
                Talk to us
              </a>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const FOOTER_LINK =
  'rounded-sm text-limestone underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-oxide-on-dark';

export function LandingFooter() {
  return (
    <footer className="border-t border-dark-line bg-basalt text-muted-light">
      <div
        className={cn(
          WRAP,
          'grid gap-8 py-12 text-sm md:grid-cols-[1fr_2fr_auto] md:items-start md:gap-12',
        )}
      >
        <BrandLockup subtitle="Emissions accounting" />
        <div className="max-w-xl space-y-3">
          <p>
            Emissions figures are not carbon credits. {PRODUCT_NAME} does not claim regulatory
            compliance or independent verification.
          </p>
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            <Link to="/methodology" className={FOOTER_LINK}>
              Read how emissions are calculated
            </Link>
            <Link to="/docs" className={FOOTER_LINK}>
              API reference
            </Link>
          </p>
        </div>
        <p className="figure text-xs">
          © {new Date().getFullYear()} {PRODUCT_NAME}
        </p>
      </div>
    </footer>
  );
}
