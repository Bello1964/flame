import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  NUPRC_REPORT_KIND_LABELS,
  type IssuedReportDto,
  type NuprcReportKind,
} from '@flame/shared';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage, fieldErrorsOf } from '@/lib/api-client';
import { RecordFormDialog } from '@/features/hierarchy/record-form-dialog';
import { useIssueReport, useRecordSubmission, useRejectIssued } from './nuprc-api';

const reasonSchema = z.object({
  reason: z.string().trim().max(2000, 'Use at most 2000 characters'),
});

/** Issues the live report for a period as a frozen snapshot awaiting approval. */
export function IssueDialog({
  orgId,
  kind,
  period,
  periodLabel,
  needsReason,
  onClose,
  onIssued,
}: {
  orgId: string;
  kind: NuprcReportKind;
  period: string;
  periodLabel: string;
  /** A version was already issued for this period, so a reason is required. */
  needsReason: boolean;
  onClose: () => void;
  onIssued: (report: IssuedReportDto) => void;
}) {
  const issue = useIssueReport(orgId);
  const [formError, setFormError] = useState<string | null>(null);
  const schema = needsReason
    ? reasonSchema.refine((v) => v.reason !== '', {
        path: ['reason'],
        message: 'Say why this report is issued again',
      })
    : reasonSchema;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof reasonSchema>>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });

  const submit = handleSubmit((v) => {
    setFormError(null);
    issue.mutate(
      { kind, period, ...(v.reason ? { reason: v.reason } : {}) },
      {
        onSuccess: (report) => {
          toast.success(
            `Version ${String(report.version)} issued. Another Owner or Approver must approve it.`,
          );
          onIssued(report);
        },
        onError: (error) => {
          const fields = fieldErrorsOf(error);
          const message = fields['reason']?.[0];
          if (message) setError('reason', { type: 'server', message });
          else setFormError(fields['period']?.[0] ?? errorMessage(error));
        },
      },
    );
  });

  return (
    <RecordFormDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`Issue ${NUPRC_REPORT_KIND_LABELS[kind].toLowerCase()}`}
      description={`${periodLabel}. The report is frozen exactly as it is now: later changes to data never alter it. A different Owner or Approver then approves or rejects it.`}
      submitLabel="Issue report"
      submitting={issue.isPending}
      isDirty
      formError={formError}
      onSubmit={(e) => void submit(e)}
    >
      <FormField
        label={needsReason ? 'Why issue a new version' : 'Note (optional)'}
        required={needsReason}
        description={
          needsReason
            ? 'This period already has an issued version. Once approved, the new version supersedes it; both are kept.'
            : undefined
        }
        error={errors.reason?.message}
      >
        {(c) => <Textarea rows={3} {...c} {...register('reason')} />}
      </FormField>
    </RecordFormDialog>
  );
}

const rejectSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(1, 'Say why the report is rejected')
    .max(2000, 'Use at most 2000 characters'),
});

export function RejectDialog({
  orgId,
  report,
  onClose,
}: {
  orgId: string;
  report: IssuedReportDto;
  onClose: () => void;
}) {
  const reject = useRejectIssued(orgId);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<z.infer<typeof rejectSchema>>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { comment: '' },
  });
  const submit = handleSubmit((v) => {
    setFormError(null);
    reject.mutate(
      { id: report.id, comment: v.comment },
      {
        onSuccess: () => {
          toast.success('Report rejected.');
          onClose();
        },
        onError: (error) => {
          setFormError(errorMessage(error));
        },
      },
    );
  });
  return (
    <RecordFormDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`Reject version ${String(report.version)}`}
      description="The issuer sees your comment. A corrected version can then be issued."
      submitLabel="Reject report"
      submitting={reject.isPending}
      isDirty={isDirty}
      formError={formError}
      onSubmit={(e) => void submit(e)}
    >
      <FormField label="Comment" required error={errors.comment?.message}>
        {(c) => <Textarea rows={3} {...c} {...register('comment')} />}
      </FormField>
    </RecordFormDialog>
  );
}

const submissionSchema = z.object({
  submittedOn: z.iso.date('Pick the date it was submitted'),
  reference: z.string().trim().max(200, 'Use at most 200 characters'),
});

export function SubmissionDialog({
  orgId,
  report,
  onClose,
}: {
  orgId: string;
  report: IssuedReportDto;
  onClose: () => void;
}) {
  const record = useRecordSubmission(orgId);
  const [formError, setFormError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof submissionSchema>>({
    resolver: zodResolver(submissionSchema),
    defaultValues: { submittedOn: today, reference: '' },
  });
  const submit = handleSubmit((v) => {
    setFormError(null);
    record.mutate(
      {
        id: report.id,
        submittedOn: v.submittedOn,
        ...(v.reference ? { reference: v.reference } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Submission recorded.');
          onClose();
        },
        onError: (error) => {
          const message = fieldErrorsOf(error)['submittedOn']?.[0];
          if (message) setError('submittedOn', { type: 'server', message });
          else setFormError(errorMessage(error));
        },
      },
    );
  });
  return (
    <RecordFormDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Record submission to NUPRC"
      description="When this approved report was submitted, and NUPRC's reference if you have one. Recorded once."
      submitLabel="Record submission"
      submitting={record.isPending}
      isDirty
      formError={formError}
      onSubmit={(e) => void submit(e)}
    >
      <FormField label="Submitted on" required error={errors.submittedOn?.message}>
        {(c) => (
          <Input
            type="date"
            max={today}
            className="sm:max-w-48"
            {...c}
            {...register('submittedOn')}
          />
        )}
      </FormField>
      <FormField label="NUPRC reference (optional)" error={errors.reference?.message}>
        {(c) => <Input autoComplete="off" {...c} {...register('reference')} />}
      </FormField>
    </RecordFormDialog>
  );
}
