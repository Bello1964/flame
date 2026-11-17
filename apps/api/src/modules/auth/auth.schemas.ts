import { z } from 'zod';
import { NEW_PASSWORD_MAX, NEW_PASSWORD_MIN } from '@flame/shared';

export const loginBodySchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  // Upper bound guards the hashing cost against oversized inputs.
  password: z.string().min(1).max(256),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

const newPassword = z
  .string()
  .min(NEW_PASSWORD_MIN, `Choose a password of at least ${String(NEW_PASSWORD_MIN)} characters`)
  .max(NEW_PASSWORD_MAX, `Use at most ${String(NEW_PASSWORD_MAX)} characters`);

/** Raw link tokens are 43 base64url characters; the bounds only reject junk early. */
const linkToken = z.string().min(20).max(128);

export const passwordResetRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
});
export type PasswordResetRequestBody = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetCompleteSchema = z.strictObject({
  token: linkToken,
  password: newPassword,
});
export type PasswordResetCompleteBody = z.infer<typeof passwordResetCompleteSchema>;

export const passwordChangeSchema = z.strictObject({
  // Only verified, like sign-in, so any length up to the hashing bound.
  currentPassword: z.string().min(1).max(256),
  newPassword,
});
export type PasswordChangeBody = z.infer<typeof passwordChangeSchema>;

export const accountUpdateSchema = z.strictObject({
  name: z.string().trim().min(1, 'Enter your name').max(200, 'Use at most 200 characters'),
});
export type AccountUpdateBody = z.infer<typeof accountUpdateSchema>;
