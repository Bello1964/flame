import type { ReactNode, SyntheticEvent } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RecordFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  submitLabel: string;
  submitting: boolean;
  /** Unsaved edits: clicking outside or pressing Escape will not discard them. */
  isDirty: boolean;
  /** For edits: nothing to save until a field changes. */
  requireChanges?: boolean;
  /** Wider dialog for long forms. */
  wide?: boolean;
  formError: string | null;
  onSubmit: (e: SyntheticEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

export function RecordFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitting,
  isDirty,
  requireChanges = false,
  wide = false,
  formError,
  onSubmit,
  children,
}: RecordFormDialogProps) {
  const guard = (e: Event) => {
    if (isDirty || submitting) e.preventDefault();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent
        onInteractOutside={guard}
        onEscapeKeyDown={guard}
        className={wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {formError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {formError}
            </p>
          )}
          {children}
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || (requireChanges && !isDirty)}>
              {submitting && <Loader2 className="animate-spin" aria-hidden />}
              {submitting ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
