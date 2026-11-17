import { z } from 'zod';
import { emailSchema } from '../organisations/members.schemas.js';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** ISO 3166-1 alpha-2, checked against the region codes the runtime knows. */
const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Use a two-letter ISO 3166-1 country code')
  .refine((code) => {
    try {
      return regionNames.of(code) !== code;
    } catch {
      return false;
    }
  }, 'Unknown country code');

export const organisationCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  country: countrySchema.default('NG'),
  ownerEmail: emailSchema,
});
export type OrganisationCreateInput = z.infer<typeof organisationCreateSchema>;

export const emailBodySchema = z.strictObject({ email: emailSchema });

export const organisationParamSchema = z.object({ organisationId: z.uuid() });
export const userParamSchema = z.object({ userId: z.uuid() });
export { invitationParamSchema } from '../organisations/members.schemas.js';
