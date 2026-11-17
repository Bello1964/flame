import { z } from 'zod';
import { ROLES, type Role } from '@flame/shared';

/** Trimmed and lower-cased, matching how accounts and invitations store emails. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));

/** Roles in the canonical order of ROLES, without duplicates. */
export function normaliseRoles(roles: readonly Role[]): Role[] {
  return ROLES.filter((role) => roles.includes(role));
}

const rolesSchema = z.array(z.enum(ROLES)).min(1).max(ROLES.length).transform(normaliseRoles);

export const membershipParamSchema = z.object({ membershipId: z.uuid() });
export const invitationParamSchema = z.object({ invitationId: z.uuid() });

export const memberListQuerySchema = z.strictObject({
  includeRemoved: z.enum(['true', 'false']).optional(),
});

export const memberRolesSchema = z.strictObject({ roles: rolesSchema });
export type MemberRolesInput = z.infer<typeof memberRolesSchema>;

export const invitationCreateSchema = z.strictObject({ email: emailSchema, roles: rolesSchema });
export type InvitationCreateInput = z.infer<typeof invitationCreateSchema>;

/** Raw link tokens are 43 base64url characters; the bounds only reject junk early. */
const tokenSchema = z.string().min(20).max(128);

export const invitationTokenSchema = z.strictObject({ token: tokenSchema });

export const invitationAcceptSchema = z.strictObject({
  token: tokenSchema,
  name: z.string().trim().min(1).max(200).optional(),
  // A new account needs 12–256 characters (checked by the service); an existing account's
  // password is only verified, like sign-in, so it may be shorter.
  password: z.string().min(1).max(256).optional(),
});
export type InvitationAcceptInput = z.infer<typeof invitationAcceptSchema>;

/** New account passwords (shared with password reset and change). */
export { NEW_PASSWORD_MIN } from '@flame/shared';
