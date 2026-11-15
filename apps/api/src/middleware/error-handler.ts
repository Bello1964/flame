import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import type { ApiErrorBody } from '@carbon/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppError, notFound } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound('Route not found'));
};

function isBodyParseError(err: unknown): err is { type: string; status: number } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')
  );
}

/** Converts errors into the standard API error body. Never leaks stack traces or database details. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  };

  if (err instanceof AppError) {
    status = err.status;
    body = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? {} : { details: err.details }),
      },
    };
  } else if (err instanceof z.ZodError) {
    status = 400;
    body = {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: z.flattenError(err) },
    };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    status = 409;
    body = { error: { code: 'CONFLICT', message: 'A record with these values already exists' } };
  } else if (isBodyParseError(err)) {
    status = err.type === 'entity.too.large' ? 413 : 400;
    body = { error: { code: 'BAD_REQUEST', message: 'Malformed or oversized request body' } };
  }

  if (status >= 500) {
    req.log.error({ err }, 'Unhandled error');
  }

  res.status(status).json(body);
};
