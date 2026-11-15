import { pino, type DestinationStream, type Logger, type LevelWithSilent } from 'pino';

/**
 * Structured JSON logger. Sensitive fields are redacted; never log passwords or session tokens.
 * `destination` defaults to stdout and is only overridden in tests.
 */
export function createLogger(level: LevelWithSilent, destination?: DestinationStream): Logger {
  const options = {
    level,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-csrf-token"]',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
