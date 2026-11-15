import { CSRF_HEADER, type ApiErrorBody } from '@carbon/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
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
 * The current session's CSRF token, held in memory only (never in browser storage).
 * Set from the session response; cleared on sign-out.
 */
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

type Method = 'GET' | 'POST' | 'PATCH';

/** Query-string values; undefined and empty strings are omitted. */
export type QueryParams = Record<string, string | number | undefined>;

export function withQuery(path: string, params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  acceptStatuses: number[] = [],
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers[CSRF_HEADER] = csrfToken;

  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (res.status === 204) return undefined as T;
  const parsed: unknown = await res.json().catch(() => null);

  if (res.ok || acceptStatuses.includes(res.status)) {
    return parsed as T;
  }
  if (isApiErrorBody(parsed)) {
    throw new ApiError(res.status, parsed.error.code, parsed.error.message, parsed.error.details);
  }
  throw new ApiError(res.status, 'UNKNOWN_ERROR', 'The server returned an unexpected response');
}

/**
 * Fetch wrapper for the API. Sends cookies (session auth) and normalises errors.
 * Pass `acceptStatuses` for non-2xx responses that still carry a typed body.
 */
export function apiGet<T>(path: string, acceptStatuses: number[] = []): Promise<T> {
  return request<T>('GET', path, undefined, acceptStatuses);
}

/** State-changing request. Attaches the session's CSRF token. */
export function apiSend<T>(method: 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  return request<T>(method, path, body);
}

/** Field errors from a VALIDATION_ERROR response (z.flattenError shape). */
export function fieldErrorsOf(error: unknown): Record<string, string[]> {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {};
  const details = error.details;
  if (typeof details !== 'object' || details === null || !('fieldErrors' in details)) return {};
  const fieldErrors = details.fieldErrors;
  if (typeof fieldErrors !== 'object' || fieldErrors === null) return {};
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    if (Array.isArray(value)) {
      result[key] = value.filter((v): v is string => typeof v === 'string');
    }
  }
  return result;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Could not reach the server. Check your connection and try again.';
}
