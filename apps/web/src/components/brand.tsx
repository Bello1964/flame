import { cn } from '@/lib/utils';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * The Flame mark: a precise, geometric flame inside a rounded square, drawn from the
 * brand palette (currentColor for the frame, mint and moss for the flame).
 */
export function FlameMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-forest" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" className="fill-none stroke-mint/25" />
      <path
        d="M16 6c-3.6 4.4-6.6 7.7-6.6 11.6a6.6 6.6 0 0 0 13.2 0C22.6 13.7 19.6 10.4 16 6z"
        className="fill-mint"
      />
      <path
        d="M16 14.6c-1.5 1.8-2.6 3.2-2.6 4.6a2.6 2.6 0 0 0 5.2 0c0-1.4-1.1-2.8-2.6-4.6z"
        className="fill-moss"
      />
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
            'text-[0.95rem] font-semibold tracking-[0.08em] uppercase',
            tone === 'dark' ? 'text-mint' : 'text-forest',
          )}
        >
          {PRODUCT_NAME}
        </span>
        {subtitle && (
          <span
            className={cn('text-xs', tone === 'dark' ? 'text-mint/70' : 'text-muted-foreground')}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
