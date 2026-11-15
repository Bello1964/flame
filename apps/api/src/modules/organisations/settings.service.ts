import type { OrganisationSettingsDto } from '@carbon/shared';
import type { Organisation, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { recordAudit } from '../audit/audit.service.js';
import { changeSet, withStoredValues } from '../audit/change-set.js';
import type { SettingsUpdate } from '../activity/activity.schemas.js';
import { toKelvin, toKpaAbsolute } from '../activity/standardise.js';
import type { Actor } from '../facilities/facilities.service.js';

function toDto(o: Organisation): OrganisationSettingsDto {
  return {
    defaultReferenceTemperature: {
      value: o.defaultReferenceTemperature.toString(),
      unit: o.defaultReferenceTemperatureUnit,
    },
    defaultReferencePressure: {
      value: o.defaultReferencePressure.toString(),
      unit: o.defaultReferencePressureUnit,
    },
  };
}

function fieldError(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Invalid request', {
    formErrors: [],
    fieldErrors: { [field]: [message] },
  });
}

/**
 * Organisation-level settings. Currently the default source reference condition that
 * prefills new activity records (ARCHITECTURAL_WORKFLOW.md §4.1). Changing it never
 * alters existing records, which keep the condition they were entered with.
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
      const next = {
        ...(t
          ? { defaultReferenceTemperature: t.value, defaultReferenceTemperatureUnit: t.unit }
          : {}),
        ...(p ? { defaultReferencePressure: p.value, defaultReferencePressureUnit: p.unit } : {}),
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
