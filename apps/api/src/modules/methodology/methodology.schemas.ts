import { z } from 'zod';
import { CALCULATION_ROUTES } from '@flame/shared';

const text = (max: number) => z.string().trim().min(1).max(max);

const reference = z.strictObject({
  label: text(500),
  location: text(500),
  url: z.url().max(1000).optional(),
});

const stepSchema = z.strictObject({
  key: text(50),
  title: text(200),
  formula: text(500),
  explanation: text(2000),
  parameters: z.array(text(100)).max(30),
});

/** The explanatory content of an edition; the engine's numbers live in parameters. */
export const methodologyContentSchema = z.strictObject({
  overview: z.array(text(4000)).min(1).max(20),
  routes: z
    .array(
      z.strictObject({
        key: z.enum(CALCULATION_ROUTES),
        title: text(200),
        appliesTo: text(1000),
        requires: z.array(text(1000)).max(20),
        steps: z.array(stepSchema).min(1).max(20),
        /** e.g. "IPCC Tier 2", with its source; set by Platform Administrators only. */
        reportingTier: z.strictObject({ label: text(100), reference }).optional(),
      }),
    )
    .min(1)
    .max(10),
  decisions: z
    .array(
      z.strictObject({
        key: text(100),
        title: text(300),
        decision: text(4000),
        reason: text(4000),
        references: z.array(reference).min(1).max(20),
      }),
    )
    .min(1)
    .max(100)
    .refine((d) => new Set(d.map((x) => x.key)).size === d.length, 'Decision keys must be unique'),
  limitations: z.array(text(2000)).max(30),
});

export const editionUpdateSchema = z
  .strictObject({
    title: text(300).optional(),
    summary: text(4000).optional(),
    content: methodologyContentSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

const DECIMAL = /^-?(0|[1-9]\d{0,19})(\.\d{1,20})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const parameterUpdateSchema = z
  .strictObject({
    name: text(300).optional(),
    value: z
      .string()
      .trim()
      .regex(DECIMAL, 'Enter a number with at most 20 decimal places')
      .optional(),
    unit: text(100).optional(),
    appliesTo: text(1000).optional(),
    sourceOrganisation: text(200).optional(),
    sourceDocument: text(500).optional(),
    sourceEdition: text(300).optional(),
    sourceLocation: text(500).optional(),
    sourceUrl: z.url().max(1000).nullable().optional(),
    retrievedOn: z.string().regex(DATE, 'Use YYYY-MM-DD').optional(),
    notes: text(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export const reasonSchema = z.strictObject({ reason: text(2000) });

export const parameterKeySchema = z.strictObject({
  id: z.uuid(),
  key: z.string().regex(/^[a-z0-9_.]{1,100}$/),
});

export type EditionUpdate = z.output<typeof editionUpdateSchema>;
export type ParameterUpdate = z.output<typeof parameterUpdateSchema>;
