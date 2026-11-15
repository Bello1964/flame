import type { ApiErrorBody } from '@carbon/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'object'
  );
}

/**
 * Fetch wrapper for the API. Sends cookies (session auth) and normalises errors.
 * Pass `acceptStatuses` for non-2xx responses that still carry a typed body.
 */
export async function apiGet<T>(path: string, acceptStatuses: number[] = []): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  const body: unknown = await res.json().catch(() => null);

  if (res.ok || acceptStatuses.includes(res.status)) {
    return body as T;
  }
  if (isApiErrorBody(body)) {
    throw new ApiError(res.status, body.error.code, body.error.message);
  }
  throw new ApiError(res.status, 'UNKNOWN_ERROR', 'The server returned an unexpected response');
}
