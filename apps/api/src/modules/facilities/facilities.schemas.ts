import { z } from 'zod';
import { FLARE_TYPES } from '@carbon/shared';

const name = z.string().trim().min(1).max(200);
const code = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/,
    'Code must be 1–50 characters: letters, digits, dot, underscore or hyphen',
  );
const description = z.string().trim().max(2000).nullable();
const shortText = z.string().trim().min(1).max(100).nullable();
const country = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Country must be an ISO 3166-1 alpha-2 code');

/**
 * Coordinates are stored as exact decimals. Accepts a number or numeric string with
 * up to 6 decimal places and returns a string, so no binary floating-point value
 * reaches the database.
 */
function coordinate(limit: number) {
  return z
    .union([z.number(), z.string().trim()])
    .transform((v) => String(v))
    .pipe(
      z
        .string()
        .regex(/^-?\d{1,3}(\.\d{1,6})?$/, 'Use decimal degrees with at most 6 decimal places'),
    )
    .refine((v) => Math.abs(Number(v)) <= limit, `Must be between -${limit} and ${limit}`)
    .nullable();
}

export const idParamSchema = z.object({ id: z.uuid() });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  q: z.string().trim().min(1).max(100).optional(),
});

export const facilityCreateSchema = z.strictObject({
  name,
  code,
  description: description.optional(),
  region: shortText.optional(),
  country: country.optional(),
  latitude: coordinate(90).optional(),
  longitude: coordinate(180).optional(),
});

export const facilityUpdateSchema = facilityCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export const assetListQuerySchema = listQuerySchema.extend({ facilityId: z.uuid().optional() });

export const assetCreateSchema = z.strictObject({
  facilityId: z.uuid(),
  name,
  code,
  assetType: shortText.optional(),
  description: description.optional(),
});

/** facilityId is deliberately not updatable: moving an asset would rewrite its history. */
export const assetUpdateSchema = assetCreateSchema
  .omit({ facilityId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export const flareSourceListQuerySchema = listQuerySchema.extend({ assetId: z.uuid().optional() });

export const flareSourceCreateSchema = z.strictObject({
  assetId: z.uuid(),
  name,
  code,
  flareType: z.enum(FLARE_TYPES).nullable().optional(),
  description: description.optional(),
});

/** assetId is deliberately not updatable: moving a flare source would rewrite its history. */
export const flareSourceUpdateSchema = flareSourceCreateSchema
  .omit({ assetId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export type ListQuery = z.output<typeof listQuerySchema>;
export type FacilityCreate = z.output<typeof facilityCreateSchema>;
export type FacilityUpdate = z.output<typeof facilityUpdateSchema>;
export type AssetListQuery = z.output<typeof assetListQuerySchema>;
export type AssetCreate = z.output<typeof assetCreateSchema>;
export type AssetUpdate = z.output<typeof assetUpdateSchema>;
export type FlareSourceListQuery = z.output<typeof flareSourceListQuerySchema>;
export type FlareSourceCreate = z.output<typeof flareSourceCreateSchema>;
export type FlareSourceUpdate = z.output<typeof flareSourceUpdateSchema>;
