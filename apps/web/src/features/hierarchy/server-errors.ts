import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, errorMessage, fieldErrorsOf } from '@/lib/api-client';

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

  // Codes are unique per record type within an organisation; a duplicate is the
  // conflict a user can fix on this form.
  if (
    error instanceof ApiError &&
    error.status === 409 &&
    error.message === 'A record with these values already exists' &&
    fields.includes('code' as Path<T>)
  ) {
    setError('code' as Path<T>, {
      type: 'server',
      message: `Another ${recordLabel} in this organisation already uses this code`,
    });
    return null;
  }

  if (error instanceof ApiError && error.status === 403 && error.code === 'FORBIDDEN') {
    return 'Your role does not allow this change. Ask an organisation owner or administrator.';
  }
  return errorMessage(error);
}
