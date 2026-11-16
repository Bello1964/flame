import { z } from 'zod';
import { BULK_ACTIVITY_ACTIONS } from '@flame/shared';

/** Comments and reasons are kept in the record history (ARCHITECTURAL_WORKFLOW.md §7.1). */
const comment = z.string().trim().min(1).max(2000);

/** Body for actions where a comment is optional (submit, forward, approve, ...). */
export const optionalCommentSchema = z
  .strictObject({ comment: comment.optional() })
  .optional()
  .transform((v) => v?.comment);

/** Body for actions that need a reason (return, reject, release a claim). */
export const requiredCommentSchema = z.strictObject({
  comment: z.string({ error: 'Give a reason' }).trim().min(1, 'Give a reason').max(2000),
});

/** At most one page of records per request. */
export const MAX_BULK_IDS = 100;

export const bulkSchema = z.strictObject({
  action: z.enum(BULK_ACTIVITY_ACTIONS),
  ids: z
    .array(z.uuid())
    .min(1, 'Select at least one record')
    .max(MAX_BULK_IDS, `Select at most ${String(MAX_BULK_IDS)} records`)
    .refine((ids) => new Set(ids).size === ids.length, 'Each record may be listed only once'),
  comment: comment.optional(),
});

export type BulkInput = z.output<typeof bulkSchema>;
