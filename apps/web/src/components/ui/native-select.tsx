import type { ComponentProps } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A styled native <select>. Used for compact choices such as unit pickers, where the
 * platform's own control is the most accessible and works best on phones.
 */
function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select
        data-slot="native-select"
        className={cn(
          'h-9 w-full appearance-none rounded-md border border-input bg-card py-1 pr-8 pl-3 text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/25',
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-60"
        aria-hidden
      />
    </div>
  );
}

export { NativeSelect };
