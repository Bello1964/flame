import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies defaults when only DATABASE_URL is provided', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5433/db' });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/Invalid environment configuration/);
  });

  it('rejects a non-PostgreSQL DATABASE_URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow();
  });
});
