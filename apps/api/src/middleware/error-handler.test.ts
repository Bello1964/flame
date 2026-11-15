import { beforeEach, describe, expect, it } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { createOrganisation, createUser, logger, resetDatabase } from '../test/context.js';
import { errorHandler } from './error-handler.js';

beforeEach(async () => {
  await resetDatabase();
});

/** Runs a database operation in a route and returns the API's response to its error. */
async function responseTo(operation: () => Promise<unknown>) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.log = logger;
    next();
  });
  app.get('/probe', async (_req, _res, next) => {
    try {
      await operation();
      next(new Error('expected the operation to fail'));
    } catch (err) {
      next(err);
    }
  });
  app.use(errorHandler);
  return request(app).get('/probe');
}

describe('duplicate (unique-constraint) responses from real database errors', () => {
  it('never names the field for a duplicate email, so it cannot reveal accounts', async () => {
    await createUser('taken@example.com');

    const res = await responseTo(() => createUser('taken@example.com'));

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'DUPLICATE', message: 'A record with these values already exists' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/email|taken@example\.com|users_/i);
  });

  it('never names the field for a duplicate organisation slug', async () => {
    await createOrganisation('acme');

    const res = await responseTo(() => createOrganisation('acme'));

    expect(res.status).toBe(409);
    expect(res.body.error.details).toBeUndefined();
  });
});
