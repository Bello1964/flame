import { describe, expect, it } from 'vitest';
import { loadEnv, toAppConfig } from './env.js';

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

  it('refuses to start in production without RESEND_API_KEY and EMAIL_FROM', () => {
    const base = { DATABASE_URL: 'postgresql://u:p@localhost:5433/db', NODE_ENV: 'production' };
    expect(() => loadEnv(base)).toThrow(/RESEND_API_KEY/);
    expect(() => loadEnv({ ...base, RESEND_API_KEY: 're_test' })).toThrow(/EMAIL_FROM/);
    expect(() => loadEnv({ ...base, RESEND_API_KEY: '', EMAIL_FROM: '' })).toThrow(
      /RESEND_API_KEY/,
    );
    const env = loadEnv({ ...base, RESEND_API_KEY: 're_test', EMAIL_FROM: 'Flame <a@b.example>' });
    expect(toAppConfig(env).email).toEqual({
      mode: 'resend',
      apiKey: 're_test',
      from: 'Flame <a@b.example>',
    });
  });

  it('uses the development mailbox without RESEND_API_KEY outside production', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5433/db', RESEND_API_KEY: '' });
    const config = toAppConfig(env);
    expect(config.email).toEqual({ mode: 'dev-mailbox' });
    expect(config.isDevelopment).toBe(true);
    expect(() =>
      loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5433/db', RESEND_API_KEY: 're_x' }),
    ).toThrow(/EMAIL_FROM/);
  });
});
