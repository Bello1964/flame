/** Standard error body returned by the API. Never contains stack traces or database details. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: 'ok';
  database: 'ok' | 'unavailable';
}

export interface DataResponse<T> {
  data: T;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: PageMeta;
}

/**
 * 409 `DUPLICATE`: a value that must be unique is already used. `fields` names the
 * clashing fields as the client knows them (e.g. ["code"]); tenant scoping columns are
 * never listed. It is omitted when the server cannot determine the fields.
 */
export const DUPLICATE_ERROR_CODE = 'DUPLICATE';

export interface DuplicateErrorDetails {
  fields?: string[];
}
