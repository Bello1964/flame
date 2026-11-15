import { pino, type Logger, type LevelWithSilent } from 'pino';

/** Structured JSON logger. Sensitive fields are redacted; never log passwords or session tokens. */
export function createLogger(level: LevelWithSilent): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  });
}
