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
