import { z } from 'zod';
import { FLARE_SERVICES, FLARE_TYPES, type FlareService, type FlareType } from '@flame/shared';

/**
 * Client-side form validation mirroring the API's schemas
 * (apps/api/src/modules/facilities/facilities.schemas.ts). It gives early feedback
 * only; the API validates every request again and its errors are shown per field.
 */

const name = z.string().trim().min(1, 'Enter a name').max(200, 'Use at most 200 characters');
const code = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/,
    'Use 1–50 letters, digits, dots, underscores or hyphens, starting with a letter or digit',
  );
const description = z.string().trim().max(2000, 'Use at most 2,000 characters');
const shortText = z.string().trim().max(100, 'Use at most 100 characters');

function coordinate(limit: number) {
  return z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^-?\d{1,3}(\.\d{1,6})?$/.test(v),
      'Use decimal degrees with at most 6 decimal places, e.g. 4.815162',
    )
    .refine(
      (v) => v === '' || Math.abs(Number(v)) <= limit,
      `Must be between -${limit} and ${limit}`,
    );
}

export const facilityFormSchema = z.object({
  name,
  code,
  description,
  region: shortText,
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Use a two-letter ISO country code, e.g. NG'),
  latitude: coordinate(90),
  longitude: coordinate(180),
  timeZone: z
    .string()
    .trim()
    .min(1, 'Enter a time zone')
    .refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return v.includes('/') || v === 'UTC';
      } catch {
        return false;
      }
    }, 'Use an IANA time zone such as Africa/Lagos'),
});

export const assetFormSchema = z.object({ name, code, assetType: shortText, description });

export const NO_FLARE_TYPE = 'NONE';
export const NO_FLARE_SERVICE = 'NONE';

export const flareSourceFormSchema = z.object({
  name,
  code,
  flareType: z.enum([NO_FLARE_TYPE, ...FLARE_TYPES]),
  flareService: z.enum([NO_FLARE_SERVICE, ...FLARE_SERVICES]),
  description,
});

export type FacilityFormValues = z.infer<typeof facilityFormSchema>;
export type AssetFormValues = z.infer<typeof assetFormSchema>;
export type FlareSourceFormValues = z.infer<typeof flareSourceFormSchema>;

export const FLARE_SERVICE_LABELS: Record<FlareService, string> = {
  PRODUCTION: 'Production (upstream or processing)',
  REFINERY: 'Refinery',
};

export const FLARE_TYPE_LABELS: Record<FlareType, string> = {
  ELEVATED: 'Elevated',
  GROUND: 'Ground',
  ENCLOSED: 'Enclosed',
  OTHER: 'Other',
};

/** Empty optional text becomes null, which the API stores as "not recorded". */
export function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** The form's values converted to the API's representation, field by field. */
export const toApi = {
  facility: (v: FacilityFormValues) => ({
    name: v.name.trim(),
    code: v.code.trim(),
    description: textOrNull(v.description),
    region: textOrNull(v.region),
    country: v.country.trim().toUpperCase(),
    // Coordinates stay strings so no precision is lost before the API stores them as decimals.
    latitude: textOrNull(v.latitude),
    longitude: textOrNull(v.longitude),
    timeZone: v.timeZone.trim(),
  }),
  asset: (v: AssetFormValues) => ({
    name: v.name.trim(),
    code: v.code.trim(),
    assetType: textOrNull(v.assetType),
    description: textOrNull(v.description),
  }),
  flareSource: (v: FlareSourceFormValues) => ({
    name: v.name.trim(),
    code: v.code.trim(),
    flareType: v.flareType === NO_FLARE_TYPE ? null : v.flareType,
    flareService: v.flareService === NO_FLARE_SERVICE ? null : v.flareService,
    description: textOrNull(v.description),
  }),
};

/**
 * Only the fields the user changed, so an edit never rewrites untouched values and
 * the audit log records exactly what changed.
 */
export function changedFields<T extends Record<string, unknown>>(
  payload: T,
  dirty: Partial<Record<keyof T, boolean | undefined>>,
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(payload) as (keyof T)[]) {
    if (dirty[key]) result[key] = payload[key];
  }
  return result;
}
