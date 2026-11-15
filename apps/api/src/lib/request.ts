import type { Request } from 'express';
import type { z } from 'zod';
import type { RequestMeta } from '../modules/auth/auth.service.js';
import { unauthorized } from './errors.js';

export function requestMeta(req: Request): RequestMeta {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

/** Parses untrusted input; a ZodError becomes a 400 VALIDATION_ERROR in the error handler. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  return schema.parse(input);
}

/** Narrows req.auth after requireAuth has run. */
export function authOf(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
