import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { DUPLICATE_ERROR_CODE } from '@carbon/shared';
import { ApiError, errorMessage, fieldErrorsOf } from '@/lib/api-client';

/** Fields named by a 409 DUPLICATE response; empty when none are named. */
function duplicateFieldsOf(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== DUPLICATE_ERROR_CODE) return [];
  const details = error.details;
  if (typeof details !== 'object' || details === null || !('fields' in details)) return [];
  const fields = details.fields;
  return Array.isArray(fields) ? fields.filter((f): f is string => typeof f === 'string') : [];
}

/**
 * Puts API errors next to the fields they concern. Returns the message to show at the
 * top of the form for anything that is not tied to a field, or null.
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
  recordLabel: string,
): string | null {
  const fieldErrors = fieldErrorsOf(error);
  let mapped = false;
  for (const field of fields) {
    const messages = fieldErrors[field];
    if (messages?.[0]) {
      setError(field, { type: 'server', message: messages[0] });
      mapped = true;
    }
  }
  if (mapped) return null;

  // A value that must be unique (e.g. the code, unique per record type within an
  // organisation) is already used. The API names the clashing fields.
  const duplicates = duplicateFieldsOf(error).filter((f): f is Path<T> =>
    fields.includes(f as Path<T>),
  );
  if (duplicates.length > 0) {
    for (const field of duplicates) {
      setError(field, {
        type: 'server',
        message: `Another ${recordLabel} in this organisation already uses this ${field === 'code' ? 'code' : 'value'}`,
      });
    }
    return null;
  }

  if (error instanceof ApiError && error.status === 403 && error.code === 'FORBIDDEN') {
    return 'Your role does not allow this change. Ask an organisation owner or administrator.';
  }
  return errorMessage(error);
}
