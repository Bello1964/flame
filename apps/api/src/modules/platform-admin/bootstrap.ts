import { NEW_PASSWORD_MAX, NEW_PASSWORD_MIN } from '@flame/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { recordAudit } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password.js';

export interface PlatformAdminAccount {
  email: string;
  password: string;
  name: string;
}

export interface BootstrapResult {
  /** Accounts created by this run. */
  created: string[];
  /** Platform Administrators that already existed; left exactly as they were. */
  existing: string[];
  /** Email of the supreme Platform Administrator if this run assigned the role, else null. */
  supremeAssigned: string | null;
}

/**
 * Creates Platform Administrators (no organisation membership) for the development seed
 * and the production bootstrap script (ARCHITECTURAL_WORKFLOW.md §12.1). Never run through
 * the API.
 *
 * - Idempotent: an existing Platform Administrator is left unchanged (its password is
 *   never reset).
 * - An existing account that is NOT a Platform Administrator is refused, never promoted.
 * - The first listed administrator becomes the supreme Platform Administrator when nobody
 *   holds that role yet.
 * - Every creation and the supreme assignment are audited with no actor and `via`.
 */
export async function ensurePlatformAdmins(
  prisma: PrismaClient,
  accounts: readonly PlatformAdminAccount[],
  via: 'seed' | 'operator_script',
): Promise<BootstrapResult> {
  const normalised = accounts.map((a) => ({ ...a, email: a.email.trim().toLowerCase() }));
  for (const a of normalised) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) {
      throw new Error(`"${a.email}" is not a valid email address.`);
    }
    if (a.password.length < NEW_PASSWORD_MIN || a.password.length > NEW_PASSWORD_MAX) {
      throw new Error(
        `The password for ${a.email} must be ${NEW_PASSWORD_MIN}–${NEW_PASSWORD_MAX} characters.`,
      );
    }
  }
  if (new Set(normalised.map((a) => a.email)).size !== normalised.length) {
    throw new Error('Each Platform Administrator needs a different email address.');
  }

  // Hash outside the transaction: argon2 is deliberately slow.
  const prepared = await Promise.all(
    normalised.map(async (a) => ({
      email: a.email,
      name: a.name,
      passwordHash: await hashPassword(a.password),
    })),
  );

  return prisma.$transaction(async (tx) => {
    const result: BootstrapResult = { created: [], existing: [], supremeAssigned: null };
    const ids: string[] = [];
    for (const a of prepared) {
      const found = await tx.user.findUnique({
        where: { email: a.email },
        select: { id: true, isPlatformAdmin: true },
      });
      if (found && !found.isPlatformAdmin) {
        throw new Error(
          `${a.email} already has an account that is not a Platform Administrator; ` +
            'it is not promoted automatically.',
        );
      }
      if (found) {
        result.existing.push(a.email);
        ids.push(found.id);
        continue;
      }
      const user = await tx.user.create({
        data: {
          email: a.email,
          name: a.name,
          passwordHash: a.passwordHash,
          isPlatformAdmin: true,
        },
        select: { id: true },
      });
      await recordAudit(tx, {
        actorUserId: null,
        action: 'platform_admin.bootstrapped',
        entityType: 'User',
        entityId: user.id,
        metadata: { via },
      });
      result.created.push(a.email);
      ids.push(user.id);
    }

    const firstId = ids[0];
    const first = prepared[0];
    if (firstId && first) {
      const supreme = await tx.user.findFirst({
        where: { isSupremeAdmin: true },
        select: { id: true },
      });
      const candidate = await tx.user.findUnique({
        where: { id: firstId },
        select: { status: true },
      });
      if (!supreme && candidate?.status === 'ACTIVE') {
        await tx.user.update({ where: { id: firstId }, data: { isSupremeAdmin: true } });
        await recordAudit(tx, {
          actorUserId: null,
          action: 'platform_admin.supreme_transferred',
          entityType: 'User',
          entityId: firstId,
          metadata: { fromUserId: null, via },
        });
        result.supremeAssigned = first.email;
      }
    }
    return result;
  });
}

/**
 * Reads PREFIX_1_EMAIL/_PASSWORD/_NAME and PREFIX_2_… from the environment, skipping a
 * number whose email is unset. Throws when an email is set without a password.
 */
export function platformAdminsFromEnv(
  env: NodeJS.ProcessEnv,
  prefix: string,
): PlatformAdminAccount[] {
  const accounts: PlatformAdminAccount[] = [];
  for (const n of ['1', '2']) {
    const email = env[`${prefix}_${n}_EMAIL`]?.trim();
    if (!email) continue;
    const password = env[`${prefix}_${n}_PASSWORD`];
    if (!password) throw new Error(`Set ${prefix}_${n}_PASSWORD.`);
    const name = env[`${prefix}_${n}_NAME`]?.trim() || `Platform Administrator ${n}`;
    accounts.push({ email, password, name });
  }
  return accounts;
}
