import { z } from 'zod';
import {
  CALCULATION_ROUTES,
  CALCULATION_STATUSES,
  EFFICIENCY_BASES,
  EFFICIENCY_SOURCES,
  GAS_COMPONENTS,
  type GasComponent,
} from '@flame/shared';
import { isoDate } from '../activity/activity.schemas.js';

const text = (max: number) => z.string().trim().min(1).max(max);

/** Percent from 0 to 100 with up to 6 decimal places, as entered (never rounded). */
const percent = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d{0,2})(\.\d{1,6})?$/, 'Enter a percentage with at most 6 decimal places')
  .refine((v) => Number(v) <= 100, 'A percentage can be at most 100');

const date = isoDate.refine((v) => v >= '2000-01-01', "Dates before 1 January 2000 can't be used");

const components = z.strictObject(
  Object.fromEntries(GAS_COMPONENTS.map((c) => [c, percent])) as Record<
    GasComponent,
    typeof percent
  >,
);

export const compositionCreateSchema = z
  .strictObject({
    validFrom: date,
    sampleDate: date,
    sampleReference: text(300),
    analysisMethod: text(300).nullable().optional(),
    components,
    hexanesPlusCarbonNumber: z
      .string()
      .trim()
      .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Enter a carbon number with at most 4 decimal places')
      .refine((v) => Number(v) >= 6, 'The C₆+ fraction has at least 6 carbon atoms per molecule')
      .nullable()
      .optional(),
    notes: text(2000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (Number(v.components.hexanesPlus) > 0 && !v.hexanesPlusCarbonNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['hexanesPlusCarbonNumber'],
        message: 'Enter the carbon number of the C₆+ fraction (from the analysis)',
      });
    }
  });

export const efficiencyCreateSchema = z
  .strictObject({
    validFrom: date,
    basis: z.enum(EFFICIENCY_BASES),
    combustionEfficiencyPercent: percent.refine((v) => Number(v) > 0, 'Must be above zero'),
    uncombustedMethanePercent: percent.nullable().optional(),
    sourceReference: text(500),
    testDate: date.nullable().optional(),
    notes: text(2000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.basis !== 'DESIGN_REQUIREMENT' && !v.uncombustedMethanePercent) {
      ctx.addIssue({
        code: 'custom',
        path: ['uncombustedMethanePercent'],
        message:
          'Enter the percentage of methane leaving uncombusted (from the test or vendor data)',
      });
    }
    if (v.basis === 'MEASURED_TEST' && !v.testDate) {
      ctx.addIssue({ code: 'custom', path: ['testDate'], message: 'Enter the date of the test' });
    }
  });

export const withdrawInputSchema = z.strictObject({ reason: text(2000) });

export const runSchema = z
  .strictObject({
    route: z.enum(CALCULATION_ROUTES),
    efficiencySource: z.enum(EFFICIENCY_SOURCES).optional(),
    fallbackReason: text(2000).optional(),
    notes: text(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.route === 'COMPOSITION_FLARING' && !v.efficiencySource) {
      ctx.addIssue({
        code: 'custom',
        path: ['efficiencySource'],
        message:
          'Choose the flare efficiency: the flare’s recorded value or the methodology default',
      });
    }
    if (v.route !== 'COMPOSITION_FLARING' && v.efficiencySource) {
      ctx.addIssue({
        code: 'custom',
        path: ['efficiencySource'],
        message: 'Flare efficiency only applies to composition-based flaring',
      });
    }
    if (v.route === 'IPCC_REFERENCE_FLARING' && !v.fallbackReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallbackReason'],
        message: 'Explain why measured composition isn’t used',
      });
    }
    if (v.route !== 'IPCC_REFERENCE_FLARING' && v.fallbackReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallbackReason'],
        message: 'A fallback reason only applies to the IPCC reference case',
      });
    }
  });

export const calculationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum([...CALCULATION_STATUSES, 'ALL']).default('ALL'),
  claimedBy: z.enum(['me']).optional(),
  sort: z.enum(['created', 'submitted']).default('created'),
});

export const optionalComment = z
  .strictObject({ comment: text(2000).optional() })
  .optional()
  .transform((v) => v?.comment);

export const requiredComment = z.strictObject({
  comment: z.string({ error: 'Give a reason' }).trim().min(1, 'Give a reason').max(2000),
});

export type CompositionCreate = z.output<typeof compositionCreateSchema>;
export type EfficiencyCreate = z.output<typeof efficiencyCreateSchema>;
export type RunInput = z.output<typeof runSchema>;
export type CalculationListQuery = z.output<typeof calculationListQuerySchema>;
