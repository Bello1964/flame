import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import type { ApiErrorBody } from '@carbon/shared';
import { AppError, notFound } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound('Route not found'));
};

/** Converts errors into the standard API error body. Never leaks stack traces or database details. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof z.ZodError) {
    status = 400;
    body = {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: z.flattenError(err) },
    };
  }

  if (status >= 500) {
    req.log.error({ err }, 'Unhandled error');
  }

  res.status(status).json(body);
};
