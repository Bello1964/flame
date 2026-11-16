import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  /** Number of reverse-proxy hops to trust for client IPs (Render: 1). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(60),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  /** Failed sign-ins per account from one IP. */
  LOGIN_ACCOUNT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  /** Failed sign-ins per account from all IPs combined. */
  LOGIN_ACCOUNT_GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof envSchema>;

/** Parses and validates environment variables. Throws with a readable message on failure. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Runtime settings the Express app needs, derived from the environment. */
export interface AppConfig {
  isProduction: boolean;
  webOrigin: string;
  trustProxy: number;
  session: {
    cookieName: string;
    secureCookie: boolean;
    idleTimeoutMs: number;
    absoluteTimeoutMs: number;
  };
  loginRateLimit: {
    windowMs: number;
    /** Failed sign-ins allowed per client IP per window. */
    maxPerIp: number;
    /** Failed sign-ins allowed per account (email) from one IP per window. */
    maxPerAccountIp: number;
    /** Failed sign-ins allowed per account (email) from all IPs combined per window. */
    maxPerAccount: number;
  };
}

export function toAppConfig(env: Env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  return {
    isProduction,
    webOrigin: new URL(env.WEB_ORIGIN).origin,
    trustProxy: env.TRUST_PROXY,
    session: {
      // __Host- prefix requires Secure, Path=/ and no Domain — only usable over HTTPS.
      cookieName: isProduction ? '__Host-flame_sid' : 'flame_sid',
      secureCookie: isProduction,
      idleTimeoutMs: env.SESSION_IDLE_MINUTES * 60_000,
      absoluteTimeoutMs: env.SESSION_ABSOLUTE_HOURS * 3_600_000,
    },
    loginRateLimit: {
      windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
      maxPerIp: env.LOGIN_RATE_LIMIT_MAX,
      maxPerAccountIp: env.LOGIN_ACCOUNT_RATE_LIMIT_MAX,
      maxPerAccount: env.LOGIN_ACCOUNT_GLOBAL_RATE_LIMIT_MAX,
    },
  };
}
