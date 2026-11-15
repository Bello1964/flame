import type { Role as SharedRole } from '@carbon/shared';
import type { Role as DatabaseRole } from '../../generated/prisma/client.js';

/**
 * The permission matrix lives in @carbon/shared so the web app offers exactly the actions
 * the API allows. The API remains the only place it is enforced.
 */
export { PERMISSIONS, hasPermission, type Permission } from '@carbon/shared';

/**
 * Compile-time guard: the shared role list must match the database's Role enum exactly.
 * If a role is added to or removed from the Prisma schema without updating
 * @carbon/shared (or vice versa), type checking fails here.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const SHARED_ROLES_MATCH_DATABASE = true satisfies Same<SharedRole, DatabaseRole>;
