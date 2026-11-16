import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import { DUPLICATE_ERROR_CODE, type ApiErrorBody, type DuplicateErrorDetails } from '@flame/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppError, notFound } from '../lib/errors.js';
import { uniqueViolationFields } from '../lib/unique-violation.js';

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
    // A distinct code, plus the clashing field names when they are on the allowlist in
    // lib/unique-violation.ts (organisation-defined codes only), so clients can point at
    // the field instead of matching message text. Never the conflicting values or
    // constraint internals. Values that identify people or accounts (e.g. email) are never
    // named; endpoints that accept them must handle duplicates in their service so the
    // response does not reveal whether an account exists.
    const fields = uniqueViolationFields(err);
    const details: DuplicateErrorDetails | undefined = fields ? { fields } : undefined;
    status = 409;
    body = {
      error: {
        code: DUPLICATE_ERROR_CODE,
        message: 'A record with these values already exists',
        ...(details ? { details } : {}),
      },
    };
  } else if (isBodyParseError(err)) {
    status = err.type === 'entity.too.large' ? 413 : 400;
    body = { error: { code: 'BAD_REQUEST', message: 'Malformed or oversized request body' } };
  }

  if (status >= 500) {
    req.log.error({ err }, 'Unhandled error');
  }

  res.status(status).json(body);
};
