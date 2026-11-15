import { useId, type ReactElement, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
  'aria-required': boolean | undefined;
}

interface FormFieldProps {
  label: string;
  required?: boolean;
  description?: ReactNode;
  error?: string | undefined;
  /** Receives the props that tie the control to its label, hint and error. */
  children: (control: FieldControlProps) => ReactElement;
}

/** Label, control, hint and error, wired together for assistive technology. */
export function FormField({ label, required, description, error, children }: FormFieldProps) {
  const id = useId();
  const hintId = description ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : (
          <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        )}
      </Label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
        'aria-required': required ?? undefined,
      })}
      {description && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
