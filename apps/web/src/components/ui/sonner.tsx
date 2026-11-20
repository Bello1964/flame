import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** App-wide toast host. Light theme only until a dark theme is designed. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-right"
      richColors
      closeButton
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          // Rich colours from the FLAME status tokens, not Sonner's defaults.
          '--success-bg': 'color-mix(in srgb, var(--success) 8%, var(--white))',
          '--success-border': 'color-mix(in srgb, var(--success) 35%, transparent)',
          '--success-text': 'var(--success)',
          '--error-bg': 'color-mix(in srgb, var(--destructive) 6%, var(--white))',
          '--error-border': 'color-mix(in srgb, var(--destructive) 35%, transparent)',
          '--error-text': 'var(--destructive)',
          '--warning-bg': 'color-mix(in srgb, var(--warning) 8%, var(--white))',
          '--warning-border': 'color-mix(in srgb, var(--warning) 40%, transparent)',
          '--warning-text': 'var(--warning)',
          '--info-bg': 'color-mix(in srgb, var(--info) 7%, var(--white))',
          '--info-border': 'color-mix(in srgb, var(--info) 35%, transparent)',
          '--info-text': 'var(--info)',
          '--border-radius': 'var(--radius)',
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
