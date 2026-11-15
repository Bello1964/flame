import { useId, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/api-client';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useWithdrawActivity } from './api';

/** Withdraws a draft with a required reason. The record is kept, read-only, for history. */
export function WithdrawDialog({ recordId }: { recordId: string }) {
  const { organisationId } = useOrganisation();
  const withdraw = useWithdrawActivity(organisationId, recordId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const reasonId = useId();
  const missing = reason.trim() === '';

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (withdraw.isPending) return;
        if (next) {
          withdraw.reset();
          setReason('');
          setTouched(false);
        }
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Ban aria-hidden />
          Withdraw
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw this record?</AlertDialogTitle>
          <AlertDialogDescription>
            It stays in the history, read-only, and is excluded from overlap checks and everything
            else. It can’t be restored from here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={reasonId}>
            Reason{' '}
            <span className="text-destructive" aria-hidden>
              *
            </span>
          </Label>
          <Textarea
            id={reasonId}
            rows={3}
            value={reason}
            maxLength={2000}
            aria-required
            aria-invalid={touched && missing}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            onBlur={() => {
              setTouched(true);
            }}
            placeholder="e.g. Entered against the wrong flare source"
          />
          {touched && missing && (
            <p className="text-xs font-medium text-destructive">Give a reason for withdrawing</p>
          )}
        </div>
        {withdraw.isError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {errorMessage(withdraw.error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={withdraw.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={withdraw.isPending}
            onClick={() => {
              setTouched(true);
              if (missing) return;
              withdraw.mutate(reason.trim(), {
                onSuccess: () => {
                  toast.success('Record withdrawn.');
                  setOpen(false);
                },
              });
            }}
          >
            {withdraw.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {withdraw.isPending ? 'Withdrawing…' : 'Withdraw record'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
