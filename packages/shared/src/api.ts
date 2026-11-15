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
