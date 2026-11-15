import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Archive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { ApiError, errorMessage } from '@/lib/api-client';
import { useOrganisation } from '@/features/organisations/organisation-context';
import { useArchiveRecord, type HierarchyResource } from './api';

const CHILD_HINT: Record<HierarchyResource, string | null> = {
  facilities: 'A facility can only be archived once all of its assets are archived.',
  assets: 'An asset can only be archived once all of its flare sources are archived.',
  'flare-sources': null,
};

function archiveError(error: unknown): string {
  // Only a permission refusal; other 403s (e.g. CSRF_REJECTED) have their own message.
  if (error instanceof ApiError && error.status === 403 && error.code === 'FORBIDDEN') {
    return 'Your role does not allow archiving. Ask an organisation owner or administrator.';
  }
  return errorMessage(error);
}

/** Confirms, then archives a record. Archiving is permanent: records become read-only. */
export function ArchiveDialog({
  resource,
  id,
  name,
  label,
}: {
  resource: HierarchyResource;
  id: string;
  name: string;
  /** Singular record label, e.g. "facility". */
  label: string;
}) {
  const { organisationId } = useOrganisation();
  const archive = useArchiveRecord(organisationId, resource, id);
  const [open, setOpen] = useState(false);
  const hint = CHILD_HINT[resource];

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (archive.isPending) return;
        if (next) archive.reset();
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Archive aria-hidden />
          Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The {label} and its history are kept, but it becomes read-only and can’t be edited or
            restored from here.{hint ? ` ${hint}` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {archive.isError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {archiveError(archive.error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={archive.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={archive.isPending}
            onClick={() => {
              archive.mutate(undefined, {
                onSuccess: (saved) => {
                  toast.success(`${saved.name} archived.`);
                  setOpen(false);
                },
              });
            }}
          >
            {archive.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {archive.isPending ? 'Archiving…' : `Archive ${label}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
