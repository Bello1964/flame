import { z } from 'zod';

export const loginBodySchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  // Upper bound guards the hashing cost against oversized inputs.
  password: z.string().min(1).max(256),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
