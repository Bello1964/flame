import { z } from 'zod';
import {
  CALCULATION_ACTIONS,
  CALCULATION_COMMENT_REQUIRED,
  CSRF_HEADER,
  PERMISSIONS,
  type Permission,
  type Role,
} from '@flame/shared';
import { accountUpdateSchema, loginBodySchema } from '../modules/auth/auth.schemas.js';
import {
  passwordChangeSchema,
  passwordResetCompleteSchema,
  passwordResetRequestSchema,
} from '../modules/auth/auth.schemas.js';
import {
  activityCreateSchema,
  activityListQuerySchema,
  activityUpdateSchema,
  settingsUpdateSchema,
  withdrawSchema,
} from '../modules/activity/activity.schemas.js';
import {
  assetCreateSchema,
  assetListQuerySchema,
  assetUpdateSchema,
  facilityCreateSchema,
  facilityUpdateSchema,
  flareSourceCreateSchema,
  flareSourceListQuerySchema,
  flareSourceUpdateSchema,
  listQuerySchema,
} from '../modules/facilities/facilities.schemas.js';
import {
  calculationListQuerySchema,
  compositionCreateSchema,
  efficiencyCreateSchema,
  optionalComment,
  requiredComment,
  runSchema,
  withdrawInputSchema,
} from '../modules/calculations/calculations.schemas.js';
import { CALCULATION_ACTION_GATES } from '../modules/calculations/calculations.routes.js';
import {
  editionUpdateSchema,
  parameterUpdateSchema,
  reasonSchema,
} from '../modules/methodology/methodology.schemas.js';
import {
  invitationAcceptSchema,
  invitationCreateSchema,
  invitationTokenSchema,
  memberListQuerySchema,
  memberRolesSchema,
} from '../modules/organisations/members.schemas.js';
import {
  emailBodySchema,
  organisationCreateSchema,
} from '../modules/platform-admin/platform-admin.schemas.js';
import { reportQuerySchema, trendQuerySchema } from '../modules/reporting/reporting.schemas.js';
import {
  bulkSchema,
  optionalCommentSchema,
  requiredCommentSchema,
} from '../modules/workflow/workflow.schemas.js';
import { ACTIVITY_ACTION_GATES, REQUIRES_COMMENT } from '../modules/workflow/workflow.routes.js';
import { sharedSchemas } from './schemas.generated.js';

/**
 * The OpenAPI 3.1 description of the API (ARCHITECTURAL_WORKFLOW.md §12). Request bodies
 * and query parameters are generated from the same Zod validators the routes use, and
 * response bodies from the @flame/shared types (schemas.generated.ts), so neither can
 * drift silently. openapi.test.ts checks that every Express route is documented and every
 * documented route exists.
 */

type Schema = Record<string, unknown>;
type Access = 'public' | 'session' | 'platform-admin' | 'organisation';

type Response =
  | { kind: 'data'; status?: number; schema: string }
  | { kind: 'list'; schema: string }
  | { kind: 'page'; schema: string }
  | { kind: 'raw'; schema: string; statuses: number[] }
  | { kind: 'accepted' }
  | { kind: 'no-content' }
  | { kind: 'csv' };

export interface DocumentedRoute {
  method: 'get' | 'post' | 'patch';
  /** Express-style path under /api/v1, e.g. /organisations/:organisationId/facilities. */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  access: Access;
  permission?: Permission;
  body?: z.ZodType;
  query?: z.ZodType;
  response: Response;
  /** Error statuses beyond those implied by access and input. */
  errors?: number[];
  /**
   * Replaces the generic "permission and roles" line when the route's gate is only a first
   * check and the service decides the rest (e.g. by the record's state).
   */
  accessNote?: string;
  /** The body may be left out entirely (all its fields are optional). */
  bodyOptional?: boolean;
}

const ORG = '/organisations/:organisationId';
const ROLE_LABELS: Record<Role, string> = {
  ORGANISATION_OWNER: 'Owner',
  ADMINISTRATOR: 'Administrator',
  APPROVER: 'Approver',
  REVIEWER: 'Reviewer',
  DATA_ENTRY_OFFICER: 'Data entry officer',
  VIEWER: 'Viewer',
};

const data = (schema: string, status?: number): Response => ({
  kind: 'data',
  schema,
  ...(status === undefined ? {} : { status }),
});
const list = (schema: string): Response => ({ kind: 'list', schema });
const page = (schema: string): Response => ({ kind: 'page', schema });

function crud(
  segment: string,
  noun: string,
  dto: string,
  schemas: { list: z.ZodType; create: z.ZodType; update: z.ZodType },
): DocumentedRoute[] {
  const base = { tag: 'Facilities, assets and flare sources', access: 'organisation' as const };
  const read = { ...base, permission: 'hierarchy:read' as const };
  const write = { ...base, permission: 'hierarchy:write' as const };
  return [
    {
      ...read,
      method: 'get',
      path: `${ORG}/${segment}`,
      summary: `List ${noun}s`,
      query: schemas.list,
      response: page(dto),
    },
    {
      ...write,
      method: 'post',
      path: `${ORG}/${segment}`,
      summary: `Create a ${noun}`,
      body: schemas.create,
      response: data(dto, 201),
      errors: [409],
    },
    {
      ...read,
      method: 'get',
      path: `${ORG}/${segment}/:id`,
      summary: `Get a ${noun}`,
      response: data(dto),
    },
    {
      ...write,
      method: 'patch',
      path: `${ORG}/${segment}/:id`,
      summary: `Update a ${noun}`,
      body: schemas.update,
      response: data(dto),
      errors: [409],
    },
    {
      ...write,
      method: 'post',
      path: `${ORG}/${segment}/:id/archive`,
      summary: `Archive a ${noun}`,
      description: 'Archived records are kept, never deleted, so history stays traceable.',
      response: data(dto),
      errors: [409],
    },
  ];
}

/**
 * Actions whose route gate (any member may reach them) is only a first check; the
 * workflow rules then require the permissions below (workflow.rules.ts, calculation.rules.ts).
 */
const ACTIVITY_ACCESS_NOTES: Partial<Record<string, string>> = {
  'release-claim':
    'The reviewer who holds the claim may release it with `activity:review` (Owner, Reviewer); releasing someone else’s claim needs `activity:release-claim` (Owner).',
  return:
    'Under review: the reviewer holding the claim, with `activity:review` (Owner, Reviewer). Awaiting approval: `activity:approve` (Owner, Approver), and not someone involved in the record or its reviewer.',
};
const CALCULATION_ACCESS_NOTES: Partial<Record<string, string>> = {
  'release-claim':
    'The reviewer who holds the claim may release it with `calculation:review` (Owner, Reviewer); releasing someone else’s claim needs `calculation:release-claim` (Owner).',
  reject:
    'Under review: the reviewer holding the claim, with `calculation:review` (Owner, Reviewer). Awaiting approval: `calculation:approve` (Owner, Approver), and not someone involved in the calculation or its reviewer.',
};

const activityActions: DocumentedRoute[] = Object.entries(ACTIVITY_ACTION_GATES).map(
  ([action, permission]) => {
    const required = REQUIRES_COMMENT.has(action as never);
    const accessNote = ACTIVITY_ACCESS_NOTES[action];
    return {
      ...(accessNote ? { accessNote } : {}),
      bodyOptional: !required,
      method: 'post',
      path: `${ORG}/activity-records/:id/${action}`,
      tag: 'Review and approval',
      summary: `Activity record: ${action.replace('-', ' ')}`,
      description: `Moves the record through review and approval (ARCHITECTURAL_WORKFLOW.md §7.1). ${required ? 'A comment is required.' : 'A comment is optional.'} Separation of duties is enforced per record: anyone involved in a record cannot review or approve it, and its reviewer cannot approve it.`,
      access: 'organisation',
      permission,
      body: required ? requiredCommentSchema : optionalCommentSchema,
      response: data('ActivityRecordDto'),
      errors: [409],
    };
  },
);

const calculationActions: DocumentedRoute[] = CALCULATION_ACTIONS.map((action) => {
  const required = CALCULATION_COMMENT_REQUIRED.includes(action);
  const accessNote = CALCULATION_ACCESS_NOTES[action];
  return {
    ...(accessNote ? { accessNote } : {}),
    bodyOptional: !required,
    method: 'post',
    path: `${ORG}/calculations/:id/${action}`,
    tag: 'Emissions calculations',
    summary: `Calculation: ${action.replace('-', ' ')}`,
    description: `Moves the calculation through its own review and approval (ARCHITECTURAL_WORKFLOW.md §8.1). ${required ? 'A comment is required.' : 'A comment is optional.'} Whoever ran or submitted a calculation cannot review or approve it, and its reviewer cannot approve it.`,
    access: 'organisation',
    permission: CALCULATION_ACTION_GATES[action],
    body: required ? requiredComment : optionalComment,
    response: data('CalculationDto'),
    errors: [409],
  };
});

export const DOCUMENTED_ROUTES: DocumentedRoute[] = [
  // ─── System ────────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/health',
    tag: 'System',
    summary: 'Health check',
    description:
      'Liveness and database connectivity. Answers 503 when the database is unavailable.',
    access: 'public',
    response: { kind: 'raw', schema: 'HealthResponse', statuses: [200, 503] },
  },

  // ─── Authentication and account ────────────────────────────────────────────
  {
    method: 'post',
    path: '/auth/login',
    tag: 'Authentication',
    summary: 'Sign in',
    description:
      'Opens a server-side session and sets the HTTP-only session cookie. The response carries the CSRF token to send on every state-changing request. Failures never reveal whether the email exists. Rate-limited per IP and per account.',
    access: 'public',
    body: loginBodySchema,
    response: data('SessionResponse'),
    errors: [401, 429],
  },
  {
    method: 'get',
    path: '/auth/session',
    tag: 'Authentication',
    summary: 'Current session',
    description: 'The signed-in user, their active memberships and the CSRF token.',
    access: 'session',
    response: data('SessionResponse'),
  },
  {
    method: 'post',
    path: '/auth/logout',
    tag: 'Authentication',
    summary: 'Sign out',
    access: 'session',
    response: { kind: 'no-content' },
  },
  {
    method: 'post',
    path: '/auth/logout-all',
    tag: 'Authentication',
    summary: 'Sign out on every device',
    access: 'session',
    response: { kind: 'no-content' },
  },
  {
    method: 'post',
    path: '/auth/password-reset/request',
    tag: 'Authentication',
    summary: 'Ask for a password reset link',
    description:
      'Always answers 202 with the same body, before any account lookup, so neither the answer nor its timing reveals whether the email has an account. Only active accounts are sent a link, valid for 15 minutes. Rate-limited per IP and per email.',
    access: 'public',
    body: passwordResetRequestSchema,
    response: { kind: 'accepted' },
    errors: [429],
  },
  {
    method: 'post',
    path: '/auth/password-reset/complete',
    tag: 'Authentication',
    summary: 'Set a new password with a reset link',
    description:
      'The token travels in the body, never the URL. The link works once; every session of the account is signed out. Unknown, used, replaced and expired links get 400 PASSWORD_RESET_INVALID.',
    access: 'public',
    body: passwordResetCompleteSchema,
    response: { kind: 'no-content' },
    errors: [429],
  },
  {
    method: 'patch',
    path: '/account',
    tag: 'Account',
    summary: 'Change your name',
    access: 'session',
    body: accountUpdateSchema,
    response: data('CurrentUser'),
  },
  {
    method: 'post',
    path: '/account/password',
    tag: 'Account',
    summary: 'Change your password',
    description:
      'Needs the current password, checked like a sign-in (same rate limits). Signs out every other session; this one stays.',
    access: 'session',
    body: passwordChangeSchema,
    response: { kind: 'no-content' },
    errors: [409, 429],
  },

  // ─── Invitations (public links) ────────────────────────────────────────────
  {
    method: 'post',
    path: '/invitations/lookup',
    tag: 'Invitations',
    summary: 'Look up an invitation link',
    description: 'The token travels in the body, never the URL.',
    access: 'public',
    body: invitationTokenSchema,
    response: data('InvitationLookupDto'),
    errors: [404, 429],
  },
  {
    method: 'post',
    path: '/invitations/accept',
    tag: 'Invitations',
    summary: 'Accept an invitation',
    description:
      'Creates the account (name and password), or accepts for an existing account that is signed in or gives its password; opens a session. See ARCHITECTURAL_WORKFLOW.md §7.2.',
    access: 'public',
    body: invitationAcceptSchema,
    response: data('SessionResponse'),
    errors: [401, 403, 404, 409, 429],
  },
  {
    method: 'post',
    path: '/invitations/decline',
    tag: 'Invitations',
    summary: 'Decline an invitation',
    access: 'public',
    body: invitationTokenSchema,
    response: data('InvitationLookupDto'),
    errors: [404, 409, 429],
  },

  // ─── Methodology ───────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/methodology/editions',
    tag: 'Methodology',
    summary: 'Published methodology editions',
    description:
      'Every approved edition, current and superseded, with its routes, decisions and sourced parameters. Public: anyone can see how Flame calculates.',
    access: 'public',
    response: list('MethodologyEditionSummaryDto'),
  },
  {
    method: 'get',
    path: '/methodology/editions/:id',
    tag: 'Methodology',
    summary: 'A published methodology edition',
    access: 'public',
    response: data('MethodologyEditionDto'),
  },
  {
    method: 'get',
    path: '/admin/methodology/editions',
    tag: 'Methodology registry (Platform Administrators)',
    summary: 'All editions, drafts included',
    access: 'platform-admin',
    response: list('MethodologyEditionSummaryDto'),
  },
  {
    method: 'get',
    path: '/admin/methodology/editions/:id',
    tag: 'Methodology registry (Platform Administrators)',
    summary: 'An edition, draft or published',
    access: 'platform-admin',
    response: data('MethodologyEditionDto'),
  },
  {
    method: 'post',
    path: '/admin/methodology/editions/:id/draft',
    tag: 'Methodology registry (Platform Administrators)',
    summary: 'Start a new draft from an edition',
    access: 'platform-admin',
    response: data('MethodologyEditionDto', 201),
    errors: [409],
  },
  {
    method: 'patch',
    path: '/admin/methodology/editions/:id',
    tag: 'Methodology registry (Platform Administrators)',
    summary: 'Edit a draft edition',
    access: 'platform-admin',
    body: editionUpdateSchema,
    response: data('MethodologyEditionDto'),
    errors: [409],
  },
  {
    method: 'patch',
    path: '/admin/methodology/editions/:id/parameters/:key',
    tag: 'Methodology registry (Platform Administrators)',
    summary: 'Edit a draft parameter (value and source)',
    access: 'platform-admin',
    body: parameterUpdateSchema,
    response: data('MethodologyEditionDto'),
    errors: [409],
  },
  {
    method: 'post',
    path: '/admin/methodology/editions/:id/approve',
    tag: 'Methodology registry (Platform Administrators)',
    summary: 'Approve a draft edition',
    description:
      'A different Platform Administrator from the one who created or edited the draft must approve it. Approval supersedes the previous edition; approved editions never change.',
    access: 'platform-admin',
    response: data('MethodologyEditionDto'),
    errors: [409],
  },
  {
    method: 'post',
    path: '/admin/methodology/editions/:id/withdraw',
    tag: 'Methodology registry (Platform Administrators)',
    summary: 'Withdraw a draft edition',
    access: 'platform-admin',
    body: reasonSchema,
    response: data('MethodologyEditionDto'),
    errors: [409],
  },

  // ─── Platform administration ───────────────────────────────────────────────
  {
    method: 'get',
    path: '/admin/organisations',
    tag: 'Platform administration',
    summary: 'List organisations',
    description: 'Counts and status only; no organisation data.',
    access: 'platform-admin',
    response: list('PlatformOrganisationDto'),
  },
  {
    method: 'post',
    path: '/admin/organisations',
    tag: 'Platform administration',
    summary: 'Create an organisation and invite its first Owner',
    access: 'platform-admin',
    body: organisationCreateSchema,
    response: data('PlatformOrganisationDto', 201),
    errors: [409],
  },
  {
    method: 'post',
    path: '/admin/organisations/:organisationId/owner-invitation',
    tag: 'Platform administration',
    summary: 'Invite an Owner to a dormant organisation',
    access: 'platform-admin',
    body: emailBodySchema,
    response: data('InvitationDto', 201),
    errors: [409],
  },
  {
    method: 'post',
    path: '/admin/invitations/:invitationId/revoke',
    tag: 'Platform administration',
    summary: 'Revoke a platform-issued invitation',
    access: 'platform-admin',
    response: data('InvitationDto'),
    errors: [409],
  },
  {
    method: 'get',
    path: '/admin/platform-admins',
    tag: 'Platform administration',
    summary: 'List Platform Administrators and pending invitations',
    access: 'platform-admin',
    response: data('PlatformAdminsDto'),
  },
  {
    method: 'post',
    path: '/admin/platform-admins/invitations',
    tag: 'Platform administration',
    summary: 'Invite a Platform Administrator',
    access: 'platform-admin',
    body: emailBodySchema,
    response: data('InvitationDto', 201),
    errors: [409],
  },
  {
    method: 'post',
    path: '/admin/platform-admins/:userId/remove',
    tag: 'Platform administration',
    summary: 'Remove Platform Administrator status',
    description: 'Only the supreme administrator may do this, and never for themselves.',
    access: 'platform-admin',
    response: data('PlatformAdminRemovalDto'),
    errors: [409],
  },

  // ─── Organisation ──────────────────────────────────────────────────────────
  {
    method: 'get',
    path: ORG,
    tag: 'Organisation',
    summary: 'The organisation and your roles in it',
    access: 'organisation',
    permission: 'organisation:read',
    response: data('OrganisationDto'),
  },
  {
    method: 'get',
    path: `${ORG}/settings`,
    tag: 'Organisation',
    summary: 'Organisation settings',
    access: 'organisation',
    permission: 'organisation:read',
    response: data('OrganisationSettingsDto'),
  },
  {
    method: 'patch',
    path: `${ORG}/settings`,
    tag: 'Organisation',
    summary: 'Update organisation settings',
    description:
      'The default reference condition prefills new activity records; it never changes existing ones.',
    access: 'organisation',
    permission: 'organisation:settings',
    body: settingsUpdateSchema,
    response: data('OrganisationSettingsDto'),
  },

  // ─── Hierarchy ─────────────────────────────────────────────────────────────
  ...crud('facilities', 'facility', 'FacilityDto', {
    list: listQuerySchema,
    create: facilityCreateSchema,
    update: facilityUpdateSchema,
  }),
  ...crud('assets', 'asset', 'AssetDto', {
    list: assetListQuerySchema,
    create: assetCreateSchema,
    update: assetUpdateSchema,
  }),
  ...crud('flare-sources', 'flare source', 'FlareSourceDto', {
    list: flareSourceListQuerySchema,
    create: flareSourceCreateSchema,
    update: flareSourceUpdateSchema,
  }),

  // ─── Activity data ─────────────────────────────────────────────────────────
  {
    method: 'get',
    path: `${ORG}/activity-records`,
    tag: 'Activity data',
    summary: 'List activity records',
    access: 'organisation',
    permission: 'activity:read',
    query: activityListQuerySchema,
    response: page('ActivityRecordDto'),
  },
  {
    method: 'post',
    path: `${ORG}/activity-records`,
    tag: 'Activity data',
    summary: 'Create a draft activity record',
    description:
      'Original measurements, units and reference conditions are kept alongside the standardised values. Estimated values need an explanation. See ARCHITECTURAL_WORKFLOW.md §4.1.',
    access: 'organisation',
    permission: 'activity:write',
    body: activityCreateSchema,
    response: data('ActivityRecordDto', 201),
    errors: [409],
  },
  {
    method: 'get',
    path: `${ORG}/activity-records/:id`,
    tag: 'Activity data',
    summary: 'Get an activity record',
    access: 'organisation',
    permission: 'activity:read',
    response: data('ActivityRecordDto'),
  },
  {
    method: 'get',
    path: `${ORG}/activity-records/:id/history`,
    tag: 'Activity data',
    summary: 'An activity record’s history',
    access: 'organisation',
    permission: 'activity:read',
    response: list('ActivityRecordEventDto'),
  },
  {
    method: 'patch',
    path: `${ORG}/activity-records/:id`,
    tag: 'Activity data',
    summary: 'Edit a draft or returned record',
    access: 'organisation',
    permission: 'activity:write',
    body: activityUpdateSchema,
    response: data('ActivityRecordDto'),
    errors: [409],
  },
  {
    method: 'post',
    path: `${ORG}/activity-records/:id/withdraw`,
    tag: 'Activity data',
    summary: 'Withdraw a draft record',
    access: 'organisation',
    permission: 'activity:write',
    body: withdrawSchema,
    response: data('ActivityRecordDto'),
    errors: [409],
  },
  ...activityActions,
  {
    method: 'post',
    path: `${ORG}/activity-records/:id/revise`,
    tag: 'Review and approval',
    summary: 'Start a revision of an approved record',
    description: 'Creates a new revision; the approved record is never changed.',
    access: 'organisation',
    permission: 'activity:write',
    response: data('ActivityRecordDto', 201),
    errors: [409],
  },
  {
    method: 'post',
    path: `${ORG}/activity-records/bulk`,
    tag: 'Review and approval',
    summary: 'Apply an action to several records',
    description:
      'Each record is checked and answered separately, with the permission its action needs.',
    accessNote:
      'Any member may send the request; each record is then checked against its action’s own permission and rules (see the single-record actions). Viewers cannot perform any action.',
    access: 'organisation',
    permission: 'activity:read',
    body: bulkSchema,
    response: list('BulkActivityResult'),
  },

  // ─── Calculations ──────────────────────────────────────────────────────────
  {
    method: 'get',
    path: `${ORG}/flare-sources/:id/gas-compositions`,
    tag: 'Calculation inputs',
    summary: 'Gas analyses of a flare source',
    access: 'organisation',
    permission: 'activity:read',
    response: list('GasCompositionDto'),
  },
  {
    method: 'post',
    path: `${ORG}/flare-sources/:id/gas-compositions`,
    tag: 'Calculation inputs',
    summary: 'Record a gas analysis',
    description:
      'A dated sample with a sourced composition; the total must be 100% ±0.5% and is never normalised.',
    access: 'organisation',
    permission: 'activity:write',
    body: compositionCreateSchema,
    response: data('GasCompositionDto', 201),
    errors: [409],
  },
  {
    method: 'post',
    path: `${ORG}/gas-compositions/:id/withdraw`,
    tag: 'Calculation inputs',
    summary: 'Withdraw a gas analysis',
    access: 'organisation',
    permission: 'activity:write',
    body: withdrawInputSchema,
    response: data('GasCompositionDto'),
    errors: [409],
  },
  {
    method: 'get',
    path: `${ORG}/flare-sources/:id/flare-efficiencies`,
    tag: 'Calculation inputs',
    summary: 'Flare efficiency records of a flare source',
    access: 'organisation',
    permission: 'activity:read',
    response: list('FlareEfficiencyDto'),
  },
  {
    method: 'post',
    path: `${ORG}/flare-sources/:id/flare-efficiencies`,
    tag: 'Calculation inputs',
    summary: 'Record a flare efficiency',
    access: 'organisation',
    permission: 'activity:write',
    body: efficiencyCreateSchema,
    response: data('FlareEfficiencyDto', 201),
    errors: [409],
  },
  {
    method: 'post',
    path: `${ORG}/flare-efficiencies/:id/withdraw`,
    tag: 'Calculation inputs',
    summary: 'Withdraw a flare efficiency record',
    access: 'organisation',
    permission: 'activity:write',
    body: withdrawInputSchema,
    response: data('FlareEfficiencyDto'),
    errors: [409],
  },
  {
    method: 'get',
    path: `${ORG}/activity-records/:id/calculations`,
    tag: 'Emissions calculations',
    summary: 'Calculation versions of an activity record',
    access: 'organisation',
    permission: 'calculation:read',
    response: list('CalculationDto'),
  },
  {
    method: 'post',
    path: `${ORG}/activity-records/:id/calculations`,
    tag: 'Emissions calculations',
    summary: 'Calculate emissions for an approved record',
    description:
      'Runs only on approved activity records with an approved methodology edition; refuses when required inputs are missing (409 CALCULATION_BLOCKED, listing them). Each run is a new version with its full trace; earlier versions never change.',
    access: 'organisation',
    permission: 'calculation:run',
    body: runSchema,
    response: data('CalculationDto', 201),
    errors: [409],
  },
  {
    method: 'get',
    path: `${ORG}/calculations`,
    tag: 'Emissions calculations',
    summary: 'List calculations',
    access: 'organisation',
    permission: 'calculation:read',
    query: calculationListQuerySchema,
    response: page('CalculationDto'),
  },
  {
    method: 'get',
    path: `${ORG}/calculations/:id`,
    tag: 'Emissions calculations',
    summary: 'Get a calculation with its trace',
    access: 'organisation',
    permission: 'calculation:read',
    response: data('CalculationDto'),
  },
  {
    method: 'get',
    path: `${ORG}/calculations/:id/history`,
    tag: 'Emissions calculations',
    summary: 'A calculation’s history',
    access: 'organisation',
    permission: 'calculation:read',
    response: list('CalculationEventDto'),
  },
  ...calculationActions,

  // ─── Reports ───────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: `${ORG}/reports/emissions`,
    tag: 'Reports',
    summary: 'Emissions report for a period',
    description:
      'Approved calculations only, with coverage of what is missing or in review. tCO2e per activity type plus a labelled total; volumes are never summed across types. See ARCHITECTURAL_WORKFLOW.md §8.2.',
    access: 'organisation',
    permission: 'report:read',
    query: reportQuerySchema,
    response: data('EmissionsReportDto'),
  },
  {
    method: 'get',
    path: `${ORG}/reports/emissions/trend`,
    tag: 'Reports',
    summary: '12-month emissions trend',
    access: 'organisation',
    permission: 'report:read',
    query: trendQuerySchema,
    response: data('EmissionsTrendDto'),
  },
  {
    method: 'get',
    path: `${ORG}/reports/emissions.csv`,
    tag: 'Reports',
    summary: 'Emissions report as CSV',
    description: 'The same report as a CSV download. Each export is audited.',
    access: 'organisation',
    permission: 'report:read',
    query: reportQuerySchema,
    response: { kind: 'csv' },
  },

  // ─── Members and invitations ───────────────────────────────────────────────
  {
    method: 'get',
    path: `${ORG}/members`,
    tag: 'Members',
    summary: 'List members',
    access: 'organisation',
    permission: 'members:read',
    query: memberListQuerySchema,
    response: list('MemberDto'),
  },
  {
    method: 'patch',
    path: `${ORG}/members/:membershipId`,
    tag: 'Members',
    summary: 'Change a member’s roles',
    description: 'Only an Owner grants the Owner role. Nobody changes their own roles.',
    access: 'organisation',
    permission: 'members:manage',
    body: memberRolesSchema,
    response: data('MemberDto'),
    errors: [409],
  },
  {
    method: 'post',
    path: `${ORG}/members/:membershipId/suspend`,
    tag: 'Members',
    summary: 'Suspend a member',
    access: 'organisation',
    permission: 'members:manage',
    response: data('MemberDto'),
    errors: [409],
  },
  {
    method: 'post',
    path: `${ORG}/members/:membershipId/reinstate`,
    tag: 'Members',
    summary: 'Reinstate a suspended member',
    access: 'organisation',
    permission: 'members:manage',
    response: data('MemberDto'),
    errors: [409],
  },
  {
    method: 'post',
    path: `${ORG}/members/:membershipId/remove`,
    tag: 'Members',
    summary: 'Remove a member',
    description:
      'The membership is kept with status REMOVED. Releases the member’s review claims; an account left without any membership is disabled.',
    access: 'organisation',
    permission: 'members:manage',
    response: data('MemberRemovalDto'),
    errors: [409],
  },
  {
    method: 'get',
    path: `${ORG}/invitations`,
    tag: 'Members',
    summary: 'List invitations',
    access: 'organisation',
    permission: 'members:read',
    response: list('InvitationDto'),
  },
  {
    method: 'post',
    path: `${ORG}/invitations`,
    tag: 'Members',
    summary: 'Invite someone',
    description:
      'Valid 5 days; one pending invitation per email. The link is emailed and never returned by the API.',
    access: 'organisation',
    permission: 'members:manage',
    body: invitationCreateSchema,
    response: data('InvitationDto', 201),
    errors: [409],
  },
  {
    method: 'post',
    path: `${ORG}/invitations/:invitationId/revoke`,
    tag: 'Members',
    summary: 'Revoke an invitation',
    access: 'organisation',
    permission: 'members:manage',
    response: data('InvitationDto'),
    errors: [409],
  },
];

// ─── Building the document ───────────────────────────────────────────────────

/** JSON Schema of what a client sends (before transforms), as OpenAPI 3.1 accepts it. */
function inputSchema(schema: z.ZodType): Schema {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Schema;
  delete json['$schema'];
  return json;
}

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

function responseBody(response: Response): Record<string, unknown> {
  const json = (schema: Schema) => ({ content: { 'application/json': { schema } } });
  switch (response.kind) {
    case 'data':
      return {
        [String(response.status ?? 200)]: {
          description: 'Success',
          ...json({
            type: 'object',
            required: ['data'],
            properties: { data: ref(response.schema) },
          }),
        },
      };
    case 'list':
      return {
        '200': {
          description: 'Success',
          ...json({
            type: 'object',
            required: ['data'],
            properties: { data: { type: 'array', items: ref(response.schema) } },
          }),
        },
      };
    case 'page':
      return {
        '200': {
          description: 'One page of results',
          ...json({
            type: 'object',
            required: ['data', 'meta'],
            properties: {
              data: { type: 'array', items: ref(response.schema) },
              meta: ref('PageMeta'),
            },
          }),
        },
      };
    case 'raw':
      return Object.fromEntries(
        response.statuses.map((s) => [
          String(s),
          { description: s === 200 ? 'Success' : 'Unavailable', ...json(ref(response.schema)) },
        ]),
      );
    case 'accepted':
      return {
        '202': {
          description: 'Accepted. The same answer for every email.',
          ...json({
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['accepted'],
                properties: { accepted: { type: 'boolean', enum: [true] } },
              },
            },
          }),
        },
      };
    case 'no-content':
      return { '204': { description: 'Done; no body' } };
    case 'csv':
      return {
        '200': {
          description: 'CSV file (attachment)',
          content: { 'text/csv': { schema: { type: 'string' } } },
        },
      };
  }
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Invalid input (VALIDATION_ERROR with field errors) or a refused request',
  401: 'Not signed in, or the session has ended',
  403: 'Not allowed: missing permission, CSRF token rejected, or a rule such as separation of duties',
  404: 'Not found, or not in an organisation you belong to (existence is never revealed)',
  409: 'Conflicts with the current state (e.g. wrong status, duplicate, pending invitation, calculation inputs missing)',
  429: 'Too many attempts; try again later',
};

function errorStatuses(route: DocumentedRoute): number[] {
  const statuses = new Set<number>(route.errors ?? []);
  if (route.body || route.query || /:\w+/.test(route.path)) statuses.add(400);
  if (route.access !== 'public') statuses.add(401);
  if (route.access === 'platform-admin' || route.access === 'organisation') statuses.add(403);
  if (route.access === 'organisation' || /:\w+/.test(route.path)) statuses.add(404);
  if (route.method !== 'get') statuses.add(403); // CSRF: foreign Origin or missing token
  return [...statuses].sort();
}

function parametersOf(route: DocumentedRoute): Schema[] {
  const pathParams = [...route.path.matchAll(/:(\w+)/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: name === 'key' ? { type: 'string' } : { type: 'string', format: 'uuid' },
  }));
  if (!route.query) return pathParams;
  const query = inputSchema(route.query);
  const properties = (query['properties'] ?? {}) as Record<string, Schema>;
  const required = new Set((query['required'] ?? []) as string[]);
  const queryParams = Object.entries(properties).map(([name, schema]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema,
    ...(typeof schema['description'] === 'string' ? { description: schema['description'] } : {}),
  }));
  return [...pathParams, ...queryParams];
}

function accessText(route: DocumentedRoute): string {
  if (route.accessNote) {
    return `**Access:** active members of the organisation. ${route.accessNote} Data is limited to that organisation.`;
  }
  switch (route.access) {
    case 'public':
      return '**Access:** public, no sign-in.';
    case 'session':
      return '**Access:** any signed-in user.';
    case 'platform-admin':
      return '**Access:** Platform Administrators only. Grants no access to any organisation’s data.';
    case 'organisation': {
      const roles = route.permission
        ? (PERMISSIONS[route.permission] as readonly Role[]).map((r) => ROLE_LABELS[r]).join(', ')
        : '';
      return `**Access:** active members of the organisation with \`${route.permission ?? ''}\` (${roles}). Data is limited to that organisation.`;
    }
  }
}

/** Express path to OpenAPI path: /a/:id -> /a/{id}. */
export function openApiPath(path: string): string {
  return path.replace(/:(\w+)/g, '{$1}');
}

export interface OpenApiOptions {
  /** The session cookie's configured name (__Host-flame_sid in production). */
  cookieName?: string;
}

export function buildOpenApiDocument(options: OpenApiOptions = {}): Schema {
  const cookieName = options.cookieName ?? 'flame_sid';
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of DOCUMENTED_ROUTES) {
    const security =
      route.access === 'public'
        ? []
        : route.method === 'get'
          ? [{ sessionCookie: [] }]
          : [{ sessionCookie: [], csrfToken: [] }];
    const operation: Record<string, unknown> = {
      tags: [route.tag],
      summary: route.summary,
      operationId: `${route.method}${openApiPath(route.path).replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ?? '').toUpperCase())}`,
      description: [accessText(route), route.description].filter(Boolean).join('\n\n'),
      security,
      ...(parametersOf(route).length > 0 ? { parameters: parametersOf(route) } : {}),
      ...(route.body
        ? {
            requestBody: {
              required: route.bodyOptional !== true,
              content: { 'application/json': { schema: inputSchema(route.body) } },
            },
          }
        : {}),
      responses: {
        ...responseBody(route.response),
        ...Object.fromEntries(
          errorStatuses(route).map((s) => [
            String(s),
            { $ref: `#/components/responses/Error${String(s)}` },
          ]),
        ),
      },
    };
    (paths[openApiPath(route.path)] ??= {})[route.method] = operation;
  }

  const errorResponses = Object.fromEntries(
    Object.entries(ERROR_DESCRIPTIONS).map(([status, description]) => [
      `Error${status}`,
      { description, content: { 'application/json': { schema: ref('ApiErrorBody') } } },
    ]),
  );

  return {
    openapi: '3.1.0',
    info: {
      title: 'Flame API',
      version: '1',
      description: [
        'REST API of Flame, the carbon-management platform for gas-flaring activity data and emissions accounting.',
        '**Sessions.** Sign in with `POST /auth/login`. The API sets an HTTP-only session cookie (`flame_sid`, `__Host-flame_sid` in production) and returns a CSRF token. Send that token in the `' +
          CSRF_HEADER +
          '` header on every state-changing request; the browser sends the cookie.',
        '**Organisations.** Organisation data lives under `/organisations/{organisationId}`. Access comes only from your active membership of that organisation, never from the ID in the URL; other organisations’ data answers 404. The database enforces the same isolation (Row-Level Security).',
        '**Permissions.** Each endpoint lists the permission and roles it needs. The web app hides actions you cannot take, but the API is the only authority.',
        '**Errors.** Every error has the same body: `{ "error": { "code", "message", "details"? } }`.',
        '**Units.** Original measurements keep the units they were entered in; standardised volumes are in MMscf, flow rates in MMscf/d, emissions in tCO2e. Measured quantities and results are exact decimal strings.',
      ].join('\n\n'),
    },
    servers: [{ url: '/api/v1', description: 'This server' }],
    tags: [...new Set(DOCUMENTED_ROUTES.map((r) => r.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: cookieName,
          description: 'Server-side session (HTTP-only cookie set by POST /auth/login).',
        },
        csrfToken: {
          type: 'apiKey',
          in: 'header',
          name: CSRF_HEADER,
          description: 'The session’s CSRF token, from the sign-in or session response.',
        },
      },
      responses: errorResponses,
      schemas: sharedSchemas,
    },
  };
}
