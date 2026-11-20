import type { OrganisationSettingsDto } from '@flame/shared';
import type { Organisation, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { exact } from '../../lib/decimal.js';
import { recordAudit } from '../audit/audit.service.js';
import { changeSet, withStoredValues } from '../audit/change-set.js';
import type { SettingsUpdate } from '../activity/activity.schemas.js';
import { isCanonicalCondition, toKelvin, toKpaAbsolute } from '../activity/standardise.js';
import type { Actor } from '../facilities/facilities.service.js';

function toDto(o: Organisation): OrganisationSettingsDto {
  return {
    abbreviation: o.abbreviation,
    defaultReferenceTemperature: {
      value: exact(o.defaultReferenceTemperature),
      unit: o.defaultReferenceTemperatureUnit,
    },
    defaultReferencePressure: {
      value: exact(o.defaultReferencePressure),
      unit: o.defaultReferencePressureUnit,
    },
    defaultCompressibility:
      o.defaultZSource && o.defaultZReference && o.defaultCompressibilitySource
        ? {
            zSource: exact(o.defaultZSource),
            zReference: exact(o.defaultZReference),
            source: o.defaultCompressibilitySource,
          }
        : null,
  };
}

function fieldError(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Invalid request', {
    formErrors: [],
    fieldErrors: { [field]: [message] },
  });
}

/**
 * Organisation-level settings (ARCHITECTURAL_WORKFLOW.md §4.1):
 * - The default source reference condition that prefills new activity records.
 * - When that default differs from the canonical condition (ISO 13443), optional
 *   compressibility factors at it and at the canonical condition, with their source;
 *   they prefill records at the default condition.
 * Changing settings never alters existing records, which keep what they were entered with.
 */
export class SettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(organisationId: string): Promise<OrganisationSettingsDto> {
    return toDto(
      await this.prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } }),
    );
  }

  async update(actor: Actor, input: SettingsUpdate): Promise<OrganisationSettingsDto> {
    const t = input.defaultReferenceTemperature;
    const p = input.defaultReferencePressure;
    if (t && !toKelvin(t.value, t.unit).gt(0)) {
      throw fieldError('defaultReferenceTemperature', 'Temperature must be above absolute zero');
    }
    if (p && !toKpaAbsolute(p.value, p.unit).gt(0)) {
      throw fieldError('defaultReferencePressure', 'Absolute pressure must be above zero');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organisations WHERE id = ${actor.organisationId}::uuid FOR UPDATE`;
      const existing = await tx.organisation.findUniqueOrThrow({
        where: { id: actor.organisationId },
      });

      const temperature = t ?? {
        value: exact(existing.defaultReferenceTemperature),
        unit: existing.defaultReferenceTemperatureUnit,
      };
      const pressure = p ?? {
        value: exact(existing.defaultReferencePressure),
        unit: existing.defaultReferencePressureUnit,
      };
      const canonical = isCanonicalCondition(temperature, pressure);
      const conditionChanged =
        !toKelvin(temperature.value, temperature.unit).eq(
          toKelvin(
            exact(existing.defaultReferenceTemperature),
            existing.defaultReferenceTemperatureUnit,
          ),
        ) ||
        !toKpaAbsolute(pressure.value, pressure.unit).eq(
          toKpaAbsolute(
            exact(existing.defaultReferencePressure),
            existing.defaultReferencePressureUnit,
          ),
        );

      // Z factors describe the gas at one particular condition.
      let compressibility = input.defaultCompressibility;
      if (canonical) {
        if (compressibility) {
          throw fieldError(
            'defaultCompressibility',
            'Compressibility factors apply only when the default condition differs from 15 °C and 101.325 kPa',
          );
        }
        // Back at the standard condition, any previous defaults no longer apply.
        compressibility = null;
      } else if (
        compressibility === undefined &&
        conditionChanged &&
        existing.defaultZSource !== null
      ) {
        throw fieldError(
          'defaultCompressibility',
          'The default Z factors were for the previous condition: enter new ones for this condition, or remove them',
        );
      }

      const next = {
        ...(input.abbreviation === undefined ? {} : { abbreviation: input.abbreviation }),
        ...(t
          ? { defaultReferenceTemperature: t.value, defaultReferenceTemperatureUnit: t.unit }
          : {}),
        ...(p ? { defaultReferencePressure: p.value, defaultReferencePressureUnit: p.unit } : {}),
        ...(compressibility === undefined
          ? {}
          : {
              defaultZSource: compressibility?.zSource ?? null,
              defaultZReference: compressibility?.zReference ?? null,
              defaultCompressibilitySource: compressibility?.source ?? null,
            }),
      };
      const changes = changeSet(existing, next);
      if (Object.keys(changes).length === 0) return toDto(existing);

      const updated = await tx.organisation.update({ where: { id: existing.id }, data: next });
      await recordAudit(tx, {
        organisationId: actor.organisationId,
        actorUserId: actor.userId,
        action: 'organisation.settings_updated',
        entityType: 'Organisation',
        entityId: actor.organisationId,
        metadata: { changes: withStoredValues(changes, updated) },
        ipAddress: actor.ipAddress,
      });
      return toDto(updated);
    });
  }
}
