import { cn } from '@/lib/utils';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * The Flame mark: a flare stack drawn as a single hairline, its flame as an Oxide outline
 * with a Flare Amber core, on a Basalt tile. Restrained on purpose: an instrument, not an
 * illustration of fire. The tile keeps the mark legible on light and dark surfaces alike.
 */
export function FlameMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="3" className="fill-basalt" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="2.5"
        className="fill-none stroke-dark-line"
      />
      <path d="M16 13.5V27" className="stroke-limestone" strokeWidth="1.4" />
      <path d="M12.5 27h7" className="stroke-limestone" strokeWidth="1.4" />
      <path
        d="M16 4.5c-2.9 3.5-5.2 6.2-5.2 9.2a5.2 5.2 0 0 0 10.4 0c0-3-2.3-5.7-5.2-9.2z"
        className="fill-none stroke-oxide-on-dark"
        strokeWidth="1.5"
      />
      <circle cx="16" cy="14.2" r="1.9" className="fill-flare" />
    </svg>
  );
}

/** Mark plus wordmark. `tone` picks text colour for dark or light backgrounds. */
export function BrandLockup({
  tone = 'dark',
  subtitle,
  className,
}: {
  tone?: 'dark' | 'light';
  subtitle?: string;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <FlameMark />
      <span className="flex flex-col leading-tight">
        <span
          className={cn(
            'text-[0.8rem] font-semibold tracking-[0.24em] uppercase',
            tone === 'dark' ? 'text-limestone' : 'text-basalt',
          )}
        >
          {PRODUCT_NAME}
        </span>
        {subtitle && (
          <span
            className={cn(
              'font-mono text-[0.65rem] tracking-[0.08em] uppercase',
              tone === 'dark' ? 'text-muted-light' : 'text-muted-foreground',
            )}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
