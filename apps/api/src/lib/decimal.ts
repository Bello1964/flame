import type { Prisma } from '../generated/prisma/client.js';

/**
 * A decimal as a plain, exact string: never exponential notation (Decimal.toString()
 * gives "1e-7" for 0.0000001, which the API's own input patterns would reject).
 */
export function exact(value: Prisma.Decimal): string {
  return value.toFixed();
}
