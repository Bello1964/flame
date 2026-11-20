import type { CSSProperties } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import flareDusk from '@/assets/landing/flare3.webp';
import { PrimaryAction } from './primary-action';
import { GHOST_ON_DARK, WRAP } from './styles';
import { cn } from '@/lib/utils';
import { CONTACT_EMAIL } from '@/lib/brand';

const rise = (ms: number) => ({ '--rise-delay': `${String(ms)}ms` }) as CSSProperties;

function Reading({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0 border-t border-dark-line pt-4">
      <dt className="eyebrow text-[0.625rem] text-muted-light">{label}</dt>
      <dd
        className={cn(
          'figure mt-2 truncate text-xl sm:text-2xl',
          highlight ? 'text-flare' : 'text-limestone',
        )}
      >
        {value}
        {unit && <span className="ml-1.5 text-xs text-muted-light">{unit}</span>}
      </dd>
    </div>
  );
}

/**
 * One illustrative daily reading taken through the real pipeline. The numbers were
 * produced by the platform's own standardisation code (iso13443-real-gas-v1) for these
 * inputs; they are an example, not operational data, and are labelled as such.
 */
function IllustrativeReading() {
  return (
    <figure
      className="flame-rise mt-16 md:mt-24"
      style={rise(520)}
      aria-labelledby="reading-caption"
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
        <Reading label="Average rate · as entered" value="0.250" unit="MMscf/d" />
        <Reading label="Operating hours" value="12" unit="h" />
        <Reading label="Standardised · ISO 13443" value="0.249846" unit="MMscf/d" />
        <Reading label="Derived volume" value="0.124923" unit="MMscf" highlight />
      </dl>
      <figcaption
        id="reading-caption"
        className="mt-5 font-mono text-[0.6875rem] leading-relaxed text-muted-light"
      >
        <span className="text-limestone">Illustrative example</span> · HP-1, one day at 60 °F and
        14.73 psia, Z 0.998 → 0.997 · computed by Flame’s own iso13443-real-gas-v1 code · not
        operational data
      </figcaption>
    </figure>
  );
}

/**
 * The homepage's opening: Basalt, a single industrial photograph graded down to near
 * monochrome so the flare is the only warm light, and an editorial serif headline.
 */
export function Hero() {
  return (
    <section
      className="relative isolate overflow-hidden bg-basalt text-limestone"
      aria-labelledby="hero-heading"
    >
      {/* The photograph: the flare at dusk, desaturated, with its flame kept warm. */}
      <div
        className="absolute inset-0 -z-10 md:left-[30%] md:[mask-image:linear-gradient(90deg,transparent,black_30%)]"
        aria-hidden
      >
        <img
          src={flareDusk}
          alt=""
          decoding="async"
          fetchPriority="high"
          className="flame-settle size-full object-cover object-[58%_30%] brightness-[0.62] contrast-[1.15] grayscale-[0.55]"
        />
      </div>
      {/* Shade: Basalt from the text side, and up from the foot, so copy always reads. */}
      <div
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--basalt)_0%,color-mix(in_srgb,var(--basalt)_92%,transparent)_30%,color-mix(in_srgb,var(--basalt)_25%,transparent)_70%,color-mix(in_srgb,var(--basalt)_55%,transparent)_100%),linear-gradient(0deg,var(--basalt)_2%,transparent_45%)] max-md:bg-[linear-gradient(0deg,var(--basalt)_38%,color-mix(in_srgb,var(--basalt)_45%,transparent)_100%)]"
        aria-hidden
      />

      <div className={cn(WRAP, 'pt-32 pb-16 md:pt-44 md:pb-20')}>
        <p className="flame-rise eyebrow text-muted-light" style={rise(0)}>
          Gas-flaring emissions accounting · Nigeria and West Africa
        </p>
        <h1
          id="hero-heading"
          className="flame-rise mt-6 max-w-[15ch] font-display text-[3.25rem] leading-[0.95] tracking-[-0.015em] text-balance sm:text-display md:text-display-lg lg:text-[6.25rem]"
          style={rise(90)}
        >
          Every flare reading, accounted for to the{' '}
          <em className="text-oxide-on-dark">last decimal.</em>
        </h1>
        <p
          className="flame-rise mt-8 max-w-[34rem] text-lg leading-relaxed text-muted-light"
          style={rise(200)}
        >
          Flame records what each flare source burns or vents, standardises it to ISO 13443,
          calculates tCO2e from versioned, sourced factors, and keeps an append-only audit trail the
          application cannot rewrite.
        </p>
        <div className="flame-rise mt-10 flex flex-wrap gap-3" style={rise(300)}>
          <PrimaryAction />
          <Button asChild size="lg" variant="outline" className={GHOST_ON_DARK}>
            <a href={`mailto:${CONTACT_EMAIL}?subject=Flame`}>
              <Mail aria-hidden />
              Talk to us
            </a>
          </Button>
        </div>
        <IllustrativeReading />
      </div>
    </section>
  );
}
