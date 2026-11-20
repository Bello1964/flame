import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Status and label chips. Statuses use the semantic variants (success, pending, warning,
 * destructive, info), never the brand accent, and always carry text and usually an icon.
 * Tinted variants were measured at AA (≥ 5.2:1) for their text on their own tint.
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs font-medium [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-basalt text-limestone',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border bg-card text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        success: 'border-success/40 bg-success/8 text-success',
        pending: 'border-pending/40 bg-pending/8 text-pending',
        warning: 'border-warning/45 bg-warning/8 text-warning',
        destructive: 'border-destructive/40 bg-destructive/6 text-destructive',
        info: 'border-info/40 bg-info/8 text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, type BadgeVariant };
