import type { ReactNode } from 'react';
import {
  Ban,
  Building2,
  CircleCheck,
  Clock,
  Factory,
  Flame,
  Gauge,
  History,
  Layers,
  Lock,
  Mail,
  Ruler,
  ShieldCheck,
  Wind,
} from 'lucide-react';
import { BrandLockup } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { PrimaryAction } from './primary-action';
import { cn } from '@/lib/utils';
import { CONTACT_EMAIL, PRODUCT_NAME } from '@/lib/brand';

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold tracking-[0.18em] text-moss uppercase">{children}</p>;
}

function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="max-w-2xl space-y-3">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="text-3xl font-semibold tracking-tight text-balance text-forest">
        {title}
      </h2>
      {lead && <p className="text-lg leading-relaxed text-muted-foreground">{lead}</p>}
    </div>
  );
}

// ─── Pillars ─────────────────────────────────────────────────────────────────

const PILLARS = [
  {
    icon: Ruler,
    title: 'Precise',
    text: 'Every value is kept exactly as entered, with its unit and reference condition, and standardised to ISO 13443 (15 °C, 101.325 kPa) with a real-gas correction. Decimal arithmetic throughout: no floating-point drift.',
  },
  {
    icon: History,
    title: 'Accountable',
    text: 'Each change is attributed and recorded field by field in an append-only audit trail that even the database owner cannot rewrite. Nothing is ever silently overwritten or deleted.',
  },
  {
    icon: Lock,
    title: 'Isolated',
    text: 'Each organisation sees only its own data, enforced on every request and again by the database itself. Roles decide who can record, review and manage.',
  },
] as const;

export function Pillars() {
  return (
    <section id="platform" aria-labelledby="platform-heading" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <SectionHeading
          id="platform-heading"
          eyebrow="The platform"
          title="An accountable record of gas flaring, from the flare tip up."
          lead="Flame organises your operations as facilities, assets and flare sources, and records the gas each one flares or vents, with the precision and traceability that emissions accounting depends on."
        />
        <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border border-light-sage/70 bg-light-sage/70 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="space-y-3 bg-card p-6 md:p-8">
              <span className="flex size-10 items-center justify-center rounded-lg bg-mint text-moss">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="text-lg font-semibold text-forest">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── Workflow ────────────────────────────────────────────────────────────────

type StepStatus = 'available' | 'next' | 'planned';

const STATUS: Record<StepStatus, { label: string; icon: typeof CircleCheck; className: string }> = {
  available: { label: 'Available', icon: CircleCheck, className: 'bg-moss text-mint' },
  next: { label: 'Next', icon: Clock, className: 'border border-amber/60 text-amber' },
  planned: {
    label: 'Planned',
    icon: Clock,
    className: 'border border-light-sage text-muted-foreground',
  },
};

const STEPS: { title: string; text: string; icon: typeof Building2; status: StepStatus }[] = [
  {
    title: 'Operational hierarchy',
    text: 'Organisations, facilities, assets and flare sources, each with its own time zone and history.',
    icon: Factory,
    status: 'available',
  },
  {
    title: 'Gas activity data',
    text: 'Daily and reporting-period records for routine, non-routine and emergency flaring, venting and other releases.',
    icon: Gauge,
    status: 'available',
  },
  {
    title: 'Validation',
    text: 'Overlaps, rate-versus-volume mismatches and missing evidence flagged as data-quality warnings.',
    icon: ShieldCheck,
    status: 'available',
  },
  {
    title: 'Emissions calculation',
    text: 'Versioned tCO2e calculations from approved, sourced methodologies and emission factors.',
    icon: Flame,
    status: 'next',
  },
  {
    title: 'Review and approval',
    text: 'Submission, review and approval with separation of duties: nobody approves their own work.',
    icon: Layers,
    status: 'planned',
  },
  {
    title: 'Reporting and mitigation',
    text: 'Approved-only reports, clearly separated from preliminary views, and tracked reduction initiatives.',
    icon: Building2,
    status: 'planned',
  },
];

export function Workflow() {
  return (
    <section
      id="workflow"
      aria-labelledby="workflow-heading"
      className="relative scroll-mt-20 border-y border-light-sage/60 bg-mint/40"
    >
      <div className="flame-grid-light absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <SectionHeading
          id="workflow-heading"
          eyebrow="The workflow"
          title="From flare source to reported emissions, one step at a time."
          lead="Each stage builds on the one before it. Here is exactly what is available today and what comes next."
        />
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ title, text, icon: Icon, status }, i) => {
            const s = STATUS[status];
            const StatusIcon = s.icon;
            return (
              <li
                key={title}
                className={cn(
                  'relative flex flex-col gap-3 rounded-xl border bg-card p-6',
                  status === 'available' ? 'border-sage/60' : 'border-light-sage/70',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      s.className,
                    )}
                  >
                    <StatusIcon className="size-3" aria-hidden />
                    {s.label}
                  </span>
                </div>
                <Icon className="size-5 text-moss" aria-hidden />
                <h3 className="font-semibold text-forest">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ─── Integrity ───────────────────────────────────────────────────────────────

const REFUSALS = [
  {
    icon: Wind,
    title: 'Never treats venting as flaring',
    text: 'Flaring burns gas; venting releases it. They are separate record types, compared and reported separately.',
  },
  {
    icon: Clock,
    title: 'Never assumes a 24-hour day',
    text: 'A volume is derived from a rate only with the actual operating hours you recorded.',
  },
  {
    icon: Ruler,
    title: 'Never invents a conversion',
    text: 'Off the standard condition, both compressibility factors are required. No silent ideal-gas assumptions.',
  },
  {
    icon: Ban,
    title: 'Never invents an emission factor',
    text: 'Calculations will use only approved, sourced and versioned factors and methodologies, or not run at all.',
  },
];

export function Integrity() {
  return (
    <section
      id="integrity"
      aria-labelledby="integrity-heading"
      className="relative scroll-mt-20 overflow-hidden bg-forest text-mint"
    >
      <div className="flame-grid absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-[1fr_1.4fr]">
        <div className="max-w-md space-y-3">
          <p className="text-xs font-semibold tracking-[0.18em] text-sage uppercase">
            Built for integrity
          </p>
          <h2 id="integrity-heading" className="text-3xl font-semibold tracking-tight text-balance">
            The shortcuts {PRODUCT_NAME} refuses to take.
          </h2>
          <p className="text-lg leading-relaxed text-mint/70">
            Emissions figures are only as trustworthy as the data and assumptions beneath them. So
            the rules are enforced in the software and in the database, not left to good intentions.
          </p>
        </div>
        <ul className="grid gap-px overflow-hidden rounded-xl border border-mint/10 bg-mint/10 sm:grid-cols-2">
          {REFUSALS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="space-y-2 bg-forest p-6">
              <Icon className="size-5 text-sage" aria-hidden />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-mint/65">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── Roadmap ─────────────────────────────────────────────────────────────────

const ROADMAP = [
  {
    phase: 'Now',
    title: 'Operations and activity data',
    items: [
      'Facility, asset and flare-source hierarchy',
      'Gas activity records with ISO 13443 standardisation',
      'Data-quality warnings and a full audit trail',
    ],
  },
  {
    phase: 'Next',
    title: 'Emissions calculations',
    items: [
      'Versioned emission factors and GWP values from documented sources',
      'Traceable tCO2e calculations that can always be reproduced',
    ],
  },
  {
    phase: 'Later',
    title: 'Approval, evidence and reporting',
    items: [
      'Submission, review and approval with separation of duties',
      'Supporting evidence, approved reports and mitigation tracking',
    ],
  },
];

export function Roadmap() {
  return (
    <section id="roadmap" aria-labelledby="roadmap-heading" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <SectionHeading
          id="roadmap-heading"
          eyebrow="Roadmap"
          title="Built in the open, in the right order."
        />
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {ROADMAP.map((r, i) => (
            <li
              key={r.phase}
              className="relative space-y-3 border-t-2 pt-5 first:border-moss [&:not(:first-child)]:border-light-sage"
            >
              <p
                className={cn(
                  'font-mono text-xs tracking-[0.16em] uppercase',
                  i === 0 ? 'text-moss' : 'text-muted-foreground',
                )}
              >
                {r.phase}
              </p>
              <h3 className="text-lg font-semibold text-forest">{r.title}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {r.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-sage" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="mt-10 max-w-3xl rounded-lg border border-light-sage/70 bg-card p-4 text-sm text-muted-foreground">
          <strong className="font-semibold text-forest">A separate future module:</strong> a
          marketplace where eligible participants can trade carbon credits issued by recognised
          external programmes. Calculating tCO2e does not create or issue carbon credits, and{' '}
          {PRODUCT_NAME} does not verify or certify them.
        </p>
      </div>
    </section>
  );
}

// ─── Closing call to action and footer ───────────────────────────────────────

export function ClosingCta() {
  return (
    <section aria-labelledby="cta-heading" className="px-4 pb-20 md:px-8 md:pb-28">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-forest px-6 py-14 text-center text-mint md:px-12">
        <div className="flame-grid absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-2xl space-y-6">
          <h2 id="cta-heading" className="text-3xl font-semibold tracking-tight text-balance">
            Bring your flare data into one accountable record.
          </h2>
          <p className="text-mint/70">
            {PRODUCT_NAME} is available by invitation while it grows. Sign in to get started, or
            tell us about your operations.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <PrimaryAction />
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-mint/30 bg-transparent text-mint hover:bg-mint/10 hover:text-mint"
            >
              <a href={`mailto:${CONTACT_EMAIL}?subject=Flame`}>
                <Mail aria-hidden />
                Talk to us
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-light-sage/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <BrandLockup tone="light" />
        <p className="max-w-xl">
          Emissions figures are not carbon credits. {PRODUCT_NAME} does not claim regulatory
          compliance or independent verification.
        </p>
        <p>
          © {new Date().getFullYear()} {PRODUCT_NAME}
        </p>
      </div>
    </footer>
  );
}
