import type { CSSProperties, ReactNode } from 'react';
import { Check, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PrimaryAction } from './primary-action';
import { CONTACT_EMAIL } from '@/lib/brand';

const rise = (ms: number) => ({ '--rise-delay': `${String(ms)}ms` }) as CSSProperties;

function Readout({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] tracking-[0.14em] text-mint/55 uppercase">{label}</dt>
      <dd className="mt-1 truncate font-mono text-[0.95rem] text-mint tabular-nums">
        {value} <span className="text-mint/60">{unit}</span>
      </dd>
    </div>
  );
}

function Step({ delay, children }: { delay: number; children: ReactNode }) {
  return (
    <li className="flame-rise flex items-center gap-2 text-xs text-mint/80" style={rise(delay)}>
      <span className="flex size-4 items-center justify-center rounded-full bg-moss" aria-hidden>
        <Check className="size-3 text-mint" />
      </span>
      {children}
    </li>
  );
}

/**
 * The hero's "instrument panel": one illustrative daily reading taken through the real
 * pipeline. The numbers were produced by the platform's own standardisation code
 * (iso13443-real-gas-v1) for these inputs; they are an example, not operational data.
 */
function InstrumentPanel() {
  return (
    <figure
      className="flame-rise relative rounded-xl border border-mint/15 bg-forest/80 p-5 shadow-2xl shadow-black/30 backdrop-blur-sm sm:p-6"
      style={rise(250)}
      aria-labelledby="panel-caption"
    >
      <div className="flex items-center justify-between gap-3 border-b border-mint/10 pb-3">
        <p className="font-mono text-xs text-mint/70">HP-1 · DAILY · MEASURED</p>
        <span className="rounded-full border border-amber/50 px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-amber uppercase">
          Illustrative example
        </span>
      </div>

      <div className="grid gap-5 pt-4">
        <section aria-label="As entered">
          <p className="mb-2 text-[0.7rem] font-semibold tracking-[0.16em] text-sage uppercase">
            As entered
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Readout label="Average rate" value="0.250" unit="MMscf/d" />
            <Readout label="Operating hours" value="12" unit="h" />
            <Readout label="Temperature" value="60" unit="°F" />
            <Readout label="Pressure" value="14.73" unit="psia" />
            <Readout label="Z at condition" value="0.998" unit="" />
            <Readout label="Z at ISO 13443" value="0.997" unit="" />
          </dl>
        </section>

        <div className="relative flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-mint/30 to-mint/50" />
          <span className="font-mono text-[0.7rem] text-mint/60">× 0.999386</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent via-mint/30 to-mint/50" />
        </div>

        <section aria-label="Standardised to ISO 13443">
          <p className="mb-2 text-[0.7rem] font-semibold tracking-[0.16em] text-sage uppercase">
            Standardised · 15 °C, 101.325 kPa
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Readout label="Average rate" value="0.249846" unit="MMscf/d" />
            <Readout label="Derived volume" value="0.124923" unit="MMscf" />
          </dl>
        </section>

        <ul className="grid gap-1.5 border-t border-mint/10 pt-4">
          <Step delay={700}>Units and reference condition recorded</Step>
          <Step delay={850}>Real-gas correction with both Z factors</Step>
          <Step delay={1000}>Volume derived from actual hours, never an assumed 24 h</Step>
          <Step delay={1150}>Saved as a draft, every change audited</Step>
        </ul>
      </div>
      <figcaption id="panel-caption" className="sr-only">
        Illustrative example of how a daily flare reading is recorded and standardised. Not
        operational data.
      </figcaption>
    </figure>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-forest" aria-labelledby="hero-heading">
      <div className="flame-grid absolute inset-0" aria-hidden />
      {/* A single, soft light source behind the panel; decorative only. */}
      <div
        className="pointer-events-none absolute -top-40 right-[-10%] size-[42rem] rounded-full bg-moss/40 blur-3xl"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-28 pb-20 md:px-8 md:pt-36 md:pb-28 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-7">
          <p
            className="flame-rise inline-flex items-center gap-2 rounded-full border border-mint/20 bg-mint/5 px-3 py-1 text-xs tracking-wide text-mint/85"
            style={rise(0)}
          >
            <span className="size-1.5 rounded-full bg-amber" aria-hidden />
            Built for gas-flaring operations in Nigeria and West Africa
          </p>
          <h1
            id="hero-heading"
            className="flame-rise text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-mint sm:text-5xl lg:text-[3.6rem]"
            style={rise(80)}
          >
            Every flare reading, accounted for to the{' '}
            <span className="bg-gradient-to-r from-mint to-sage bg-clip-text text-transparent">
              last decimal.
            </span>
          </h1>
          <p className="flame-rise max-w-xl text-lg leading-relaxed text-mint/75" style={rise(160)}>
            Flame turns flaring and venting activity into precise, standardised and fully audited
            records, organised by facility, asset and flare source, ready for the emissions
            accounting that follows.
          </p>
          <div className="flame-rise flex flex-wrap gap-3" style={rise(240)}>
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
        <InstrumentPanel />
      </div>
    </section>
  );
}
