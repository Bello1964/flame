import type { ComponentProps } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Oxide: the one primary action in a view. Disabled filled buttons use the disabled
        // token (mineral, grey text), never a faded accent.
        default:
          'bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--oxide)_88%,var(--basalt))] disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-[color-mix(in_srgb,var(--destructive)_88%,var(--basalt))] disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100',
        // Neutral secondary: a hairline control edge on white.
        outline: 'border border-input bg-card hover:bg-accent hover:text-accent-foreground',
        // Patina: secondary emphasis (exports, technical actions).
        patina: 'border border-patina bg-card text-patina hover:bg-patina/8',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--mineral)_80%,var(--stone-line))]',
        // Basalt: the chosen option in a segmented control (selection, not an action).
        selected: 'bg-basalt text-limestone hover:bg-basalt',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- shadcn/ui convention
export { Button, buttonVariants };
