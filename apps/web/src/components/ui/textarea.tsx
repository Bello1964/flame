import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-base transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/25',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
