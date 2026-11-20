# Architectural Workflow

> **Status:** Draft v0.2 (2026-11-15). This document describes the _target_ architecture. It is guidance, not evidence that any feature exists. Sections marked **Implemented** reflect code in the repository; everything else is **Planned**.

## 1. System context

A multi-tenant carbon-management platform for oil and gas organisations in Nigeria and West Africa. The initial release covers gas-flaring activity data and greenhouse-gas emissions accounting. The carbon-credit marketplace, blockchain and subscription billing are out of scope.

```
Browser (React SPA)  ──HTTPS, session cookie──▶  Express API  ──Prisma──▶  PostgreSQL
                                                     │
                                                     └──signed URLs──▶  Object storage (R2 or equivalent)
```

- One deployable API and one deployable SPA (modular monolith), one shared PostgreSQL database.
- Every organisation-owned row carries `organisationId`; isolation is enforced in the backend on every operation.

## 2. Repository layout

npm workspaces monorepo. **Implemented.**

```
apps/
  api/        Express + TypeScript REST API, Prisma schema and migrations
  web/        React + Vite + TypeScript SPA
packages/
  shared/     Types, constants and Zod schemas shared by api and web (no business logic)
docs/
  architecture/
docker-compose.yml   Local PostgreSQL
```

### 2.1 Backend structure (`apps/api/src`)

```
app.ts            Express app factory (no listen; used by tests)
server.ts         Process entry point (listen, shutdown)
config/           Environment parsing and validation (Zod)
lib/              Logger, Prisma client, error types — domain-independent
middleware/       Auth, organisation context, RBAC, error handling, request logging
modules/<name>/   One folder per business module:
  <name>.routes.ts        Endpoint registration, middleware and thin HTTP handlers
                          (split into <name>.controller.ts if handlers grow)
  <name>.service.ts       Business rules, transactions and audit entries
  <name>.repository.ts    Tenant-scoped data access (organisationId on every query)
  <name>.schemas.ts       Request validation (Zod, strict objects)
  <name>.mappers.ts       Explicit response DTOs
  <name>.test.ts          API / integration tests
test/             Test database setup, app factory and data factories
```

Modules call each other only through services, never through another module's repository.

### 2.2 Frontend structure (`apps/web/src`)

```
app/              Router, providers (QueryClient), layouts
pages/            Route-level screens
features/<name>/  Feature components, hooks, API calls, form schemas
components/ui/    shadcn/ui primitives
components/       Shared composite components
lib/              API client, formatters (₦, MMscf, MMscf/d, tCO2e)
```

The frontend never computes authoritative emissions; it displays backend results.

## 3. Business modules

| Module             | Responsibility                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `auth`             | Sign-in, sign-out, sessions, password hashing, revocation, CSRF, password reset, own account (name, password) |
| `organisations`    | Organisations, memberships, roles, invitations                                                                |
| `facilities`       | Facility → Asset → Flare Source hierarchy                                                                     |
| `activity-data`    | Gas activity records (flared, vented, other releases), measured vs estimated, original and standardised units |
| `validation`       | Data-quality checks, missing-input detection, evidence gaps                                                   |
| `emission-factors` | Versioned emission factors, methodologies, GWP sets, sources                                                  |
| `calculations`     | Versioned emissions calculations producing tCO2e with full traceability                                       |
| `workflow`         | Review and approval state machine, comments, correction history                                               |
| `evidence`         | File metadata, upload validation, signed access to object storage                                             |
| `reporting`        | Approved-only official reports; clearly labelled preliminary views                                            |
| `mitigation`       | Emissions-reduction initiatives and tracking                                                                  |
| `audit`            | Append-only audit log                                                                                         |
| `email`            | Transactional email outbox, delivery worker (Resend), templates, development mailbox                          |
| `platform-admin`   | Platform-level operations, strictly separated from tenant data                                                |

## 4. Core data flow

```
Organisation → Facility → Asset → Flare Source
  → Gas Activity Data (Draft)
  → Validation
  → Emissions Calculation (versioned, tCO2e)
  → Review and Approval
  → Reporting
  → Mitigation
```

Rules:

- Flaring, venting and other releases are distinct record types; routine, non-routine and emergency events are distinguished.
- Original measurement, unit, reporting period and reference conditions are stored alongside standardised values.
- Measured and estimated values are distinct; estimates require a justification.
- Quantities use PostgreSQL `numeric` (Prisma `Decimal`), never floating point.
- tCO2e is an emissions figure. It is **not** a carbon credit and never creates one.

### 4.1 Gas activity data (Milestone 2)

Decisions confirmed with the product owner on 2026-11-15. Activity records hold operational quantities only; no emissions are calculated from them in this milestone.

- **Record kinds.** _Daily_ records (one local calendar day) and _reporting-period_ records (start and end date). Each belongs to one flare source and has one activity type: routine flaring, non-routine flaring, emergency flaring, venting, or other gas release (other requires a description). Types are never mixed in lists or totals.
- **Quantities.** An average rate (MMscf/d, Sm³/d or MMSm³/d) and/or a total volume (MMscf, Bcf, Sm³ or MMSm³). Rates and volumes are dimensionally distinct and never interchangeable. Optional actual operating duration in hours (daily: > 0 and ≤ 24; period: ≤ the period length). An explicitly entered 0 is valid data; an empty field is never treated as 0. Negative values, future dates and dates before 1 January 2000 are rejected (date floor decided 2026-11-16; also enforced by a database constraint).
- **Measured vs estimated.** Every record states which. Estimated values require an explanation. Measurement methods: Metered, Calculated, Engineering estimate, Other (Other requires a description). Data source is `MANUAL` for now; meter and system imports are future sources.
- **Precision.** PostgreSQL `numeric`; the value exactly as entered is also kept as text. Input with more decimal places than a field allows (10 for quantities, 6 for Z) is rejected, never rounded. Standardised results involve ratios that do not terminate (e.g. 288.15 / 293.15), so they are computed with 40-significant-digit decimal arithmetic and stored at 20 decimal places; because every input and constant is stored exactly, any result can be recomputed. Rounding for presentation happens only in the display.
- **Reference conditions.** The canonical condition is **ISO 13443: 15 °C (288.15 K), 101.325 kPa absolute**. Every record states the source temperature (°C, °F or K) and absolute pressure (kPa(a), bar(a) or psia), prefilled from the organisation's default reference condition (initially ISO 13443; Owners and Administrators can change it) and editable. Gauge pressure is not accepted. When the source condition differs from canonical, the compressibility factors at the source condition (Z_src) and at the canonical condition (Z_ref) are both required. This applies even at the organisation's default condition, because every record is converted to the canonical condition; the real-gas correction cannot be skipped without assuming ideal-gas behaviour, which is not permitted. To avoid re-entering them, when the organisation default differs from canonical, Owners and Administrators may store Z_src and Z_ref for that default together with their source (decision 2026-11-16). Records at exactly the default condition are prefilled with them and their source; the values remain editable and are stored on each record with the source (`compressibilitySource`). Moving a record to another condition clears prefilled values that still equal the defaults. Returning the default to canonical removes the stored Z defaults, and moving it to another non-canonical condition requires them to be restated or removed.
- **Standardisation** (server-side, at save): `V_ref = V_src × (P_src / P_ref) × (T_ref / T_src) × (Z_ref / Z_src)` with absolute temperature and pressure, then a unit conversion. Constants are derived from exact definitions (1 ft = 0.3048 m, so 1 ft³ = 0.028316846592 m³ exactly; psi from the pound, standard gravity and inch); those that don't terminate (psi in kPa, °F to K) are evaluated to 40 significant digits. Standardised values are expressed in MMscf/d and MMscf _at the canonical condition_ and always displayed with that condition. When the source condition equals canonical, the correction factor is 1 and Z is not required. The conversion version, constants, inputs, timestamp and actor are stored with the result. The original input is never altered.
- **Derived volume.** Only when an average rate and an actual operating duration are both present: `volume = rate × hours / 24`, labelled _derived_ and stored with its formula. A 24-hour day is never assumed.
- **Data-quality warnings** (worked out whenever a record is read, so they stay current as other records change; they never change values): overlap with another current record (any status except withdrawn, rejected and superseded; a revision and the record it revises don't count) for the same flare source and activity type, rate × duration differing from the entered volume by more than 1%, and no supporting evidence (uploads arrive with the evidence module). Before saving a record that overlaps, the API returns 409 `OVERLAP_UNCONFIRMED` listing the overlapping records; the client must resend with `acknowledgeOverlap: true`, and that confirmation (time and user) is stored and audited.
- **Values that can't be stored faithfully** are rejected with a field error, never saved wrong: a non-zero quantity that would standardise to zero, or a result too large for its column. Plausible operating ranges for temperature, pressure and Z are deliberately not enforced yet; they will be added once sourced values are supplied (decision 2026-11-16).
- **Time zone.** Each facility has an IANA time zone (default `Africa/Lagos`, stored in canonical spelling). Days and periods are interpreted in it, and the zone is stored on every record. A record keeps the zone it was entered in: changing the facility's zone later does not move existing records, even when they are edited. Known limitation: the daily cap is 24 operating hours, so a 25-hour day at a daylight-saving change cannot be recorded in full (the initial target zones in Nigeria and West Africa do not observe DST).
- **Lifecycle.** `DRAFT` (editable; every change audited with before and after values) and `WITHDRAWN` (with a reason; read-only, kept for history, excluded from everything else). Milestone 4 adds the review states (§7.1). Nothing is hard-deleted.
- **Archived hierarchy.** No new records on an archived flare source. Its existing drafts become read-only but can still be withdrawn (with a reason), so a source taken out of service can be tidied up.

## 5. Request pipeline (backend)

**Implemented** (Milestone 1). Every organisation-scoped endpoint runs, in order:

1. Request logging and security headers.
2. Session authentication: cookie token → SHA-256 lookup in `sessions` → `req.auth` (idle and absolute expiry, revocation, disabled users rejected).
3. CSRF for state-changing methods: a foreign `Origin` header is rejected, and authenticated requests must send the session's token in `X-CSRF-Token` (login is Origin-checked only, since it issues the token).
4. Organisation context: the client names the organisation (route parameter); the backend loads the user's **membership** for it and rejects otherwise. The membership, not the client value, becomes `req.organisation`.
5. Permission check for the specific operation.
6. Request validation (Zod) on params, query and body.
7. Handler → service → repository, with every query filtered by the authorised `organisationId` and ownership chains verified (e.g. a flare source must belong to a facility in the same organisation).
8. Consistent response or error shape; no stack traces or database details to clients. Cross-tenant lookups return 404, not 403, to avoid leaking existence. A unique-constraint clash returns 409 `DUPLICATE`; it names the clashing field only for allowlisted organisation-defined values (record codes, see `apps/api/src/lib/unique-violation.ts`). Values that identify people or accounts, such as email, are never named, and endpoints that accept them (sign-up, invitations) must handle duplicates in their service so the response does not reveal whether an account exists.

URL shape: `/api/v1/organisations/:organisationId/<resource>`. Organisation-owned child tables also carry a composite foreign key `(organisationId, parentId) → parent(organisationId, id)`, so the database rejects a child whose parent belongs to another organisation even if application code were wrong. All foreign keys are `ON DELETE RESTRICT ON UPDATE RESTRICT`: ids are immutable, so changing a record's organisation (or any referenced id) fails instead of silently carrying its children or history with it.

Implemented endpoints (all under `/api/v1`):

| Method           | Path                                                                                                                                           | Permission                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| POST             | `/auth/login`                                                                                                                                  | public, rate-limited                                   |
| GET              | `/auth/session`                                                                                                                                | signed in                                              |
| POST             | `/auth/logout`, `/auth/logout-all`                                                                                                             | signed in                                              |
| GET              | `/organisations/:organisationId`                                                                                                               | `organisation:read`                                    |
| GET              | `/organisations/:organisationId/{facilities,assets,flare-sources}` (paged, `q`, `status`, parent filter)                                       | `hierarchy:read`                                       |
| GET              | `/organisations/:organisationId/{facilities,assets,flare-sources}/:id`                                                                         | `hierarchy:read`                                       |
| POST             | `/organisations/:organisationId/{facilities,assets,flare-sources}`                                                                             | `hierarchy:write`                                      |
| PATCH            | `/organisations/:organisationId/{facilities,assets,flare-sources}/:id`                                                                         | `hierarchy:write`                                      |
| POST             | `/organisations/:organisationId/{facilities,assets,flare-sources}/:id/archive`                                                                 | `hierarchy:write`                                      |
| GET              | `/organisations/:organisationId/activity-records` (paged; `status` = a status, `CURRENT` (default) or `ALL`; `claimedBy=me`; `sort=submitted`) | `activity:read`                                        |
| GET              | `/organisations/:organisationId/activity-records/:id`, `/:id/history`                                                                          | `activity:read`                                        |
| POST, PATCH      | `/organisations/:organisationId/activity-records`, `/:id`, `/:id/withdraw`                                                                     | `activity:write`                                       |
| POST             | `/organisations/:organisationId/activity-records/:id/{submit,recall}`                                                                          | `activity:submit`                                      |
| POST             | `/organisations/:organisationId/activity-records/:id/{start-review,forward}`                                                                   | `activity:review`                                      |
| POST             | `/organisations/:organisationId/activity-records/:id/{approve,reject}`                                                                         | `activity:approve`                                     |
| POST             | `/organisations/:organisationId/activity-records/:id/{return,release-claim}`, `/bulk`                                                          | decided per record (§7.1)                              |
| POST             | `/organisations/:organisationId/activity-records/:id/revise`                                                                                   | `activity:write`                                       |
| GET, POST        | `/organisations/:organisationId/flare-sources/:id/{gas-compositions,flare-efficiencies}`                                                       | `activity:read` / `activity:write`                     |
| POST             | `/organisations/:organisationId/{gas-compositions,flare-efficiencies}/:id/withdraw`                                                            | `activity:write`                                       |
| GET, POST        | `/organisations/:organisationId/activity-records/:id/calculations`                                                                             | `calculation:read` / `calculation:run`                 |
| GET              | `/organisations/:organisationId/calculations[/:id[/history]]` (`status`, `claimedBy=me`, `sort=submitted`)                                     | `calculation:read`                                     |
| POST             | `/organisations/:organisationId/calculations/:id/{submit,recall,discard,start-review,release-claim,forward,approve,reject}`                    | decided per calculation (§8.1)                         |
| GET              | `/organisations/:organisationId/members` (`includeRemoved=true`)                                                                               | `members:read`                                         |
| PATCH            | `/organisations/:organisationId/members/:membershipId` (roles)                                                                                 | `members:manage` (§7.2)                                |
| POST             | `/organisations/:organisationId/members/:membershipId/{suspend,reinstate,remove}`                                                              | `members:manage` (§7.2)                                |
| GET, POST        | `/organisations/:organisationId/invitations`                                                                                                   | `members:read` / `members:manage`                      |
| POST             | `/organisations/:organisationId/invitations/:invitationId/revoke`                                                                              | `members:manage`                                       |
| POST             | `/invitations/{lookup,accept,decline}` (token in the body)                                                                                     | public, rate-limited                                   |
| GET, POST        | `/admin/organisations`, `/admin/organisations/:organisationId/owner-invitation`, `/admin/invitations/:invitationId/revoke`                     | Platform Administrator                                 |
| GET, POST        | `/admin/platform-admins`, `/admin/platform-admins/invitations`, `/admin/platform-admins/:userId/remove`                                        | Platform Administrator (remove: supreme only)          |
| GET              | `/dev/mailbox`                                                                                                                                 | development with no Resend key, from this machine only |
| GET              | `/methodology/editions[/:id]`                                                                                                                  | public                                                 |
| GET, POST, PATCH | `/admin/methodology/editions[/:id[/draft,/approve,/withdraw,/parameters/:key]]`                                                                | Platform Administrator                                 |

Records are archived, never deleted. Archived records are read-only, cannot receive new children, and a parent cannot be archived while it has active children. A child cannot be moved to another parent.

## 6. Roles

Data Entry Officer, Reviewer, Approver, Administrator, Organisation Owner, Viewer (per organisation, users may hold several) and Platform Administrator (platform-level, no implicit tenant data access). Initial permission matrix (`apps/api/src/modules/organisations/permissions.ts`), extended per module:

| Permission                  | Owner | Administrator | Approver | Reviewer | Data Entry | Viewer |
| --------------------------- | ----- | ------------- | -------- | -------- | ---------- | ------ |
| `organisation:read`         | ✓     | ✓             | ✓        | ✓        | ✓          | ✓      |
| `hierarchy:read`            | ✓     | ✓             | ✓        | ✓        | ✓          | ✓      |
| `hierarchy:write`           | ✓     | ✓             |          |          |            |        |
| `organisation:settings`     | ✓     | ✓             |          |          |            |        |
| `activity:read`             | ✓     | ✓             | ✓        | ✓        | ✓          | ✓      |
| `activity:write`            | ✓     | ✓             |          |          | ✓          |        |
| `activity:submit`           | ✓     | ✓             |          |          | ✓          |        |
| `activity:review`           | ✓     |               |          | ✓        |            |        |
| `activity:approve`          | ✓     |               | ✓        |          |            |        |
| `activity:release-claim`    | ✓     |               |          |          |            |        |
| `calculation:read`          | ✓     | ✓             | ✓        | ✓        | ✓          | ✓      |
| `calculation:run`           | ✓     | ✓             |          |          | ✓          |        |
| `calculation:review`        | ✓     |               |          | ✓        |            |        |
| `calculation:approve`       | ✓     |               | ✓        |          |            |        |
| `calculation:release-claim` | ✓     |               |          |          |            |        |
| `report:read`               | ✓     | ✓             | ✓        | ✓        | ✓          | ✓      |
| `members:read`              | ✓     | ✓             |          |          |            |        |
| `members:manage`            | ✓     | ✓             |          |          |            |        |

Gas analyses and flare efficiency records use `activity:read` and `activity:write`. The methodology registry is platform-level: approved editions are public, and only Platform Administrators (`users.isPlatformAdmin`) draft, edit, approve and withdraw editions; that grants no access to any organisation's data.

Members and invitations (§7.2) add rules on top of the matrix: only an Owner grants the Owner role (by role change or invitation); nobody changes their own membership. Administrators may take the Owner role away and suspend, reinstate or remove Owners, including the last one; an organisation with no active Owner is _dormant_ (§7.2).

Platform Administrators also manage organisations (creation and the first Owner invitation) and other Platform Administrators, still with no tenant data access. Exactly one of them may be the **supreme Platform Administrator** (`users.isSupremeAdmin`; a partial unique index allows at most one, and a CHECK requires `isPlatformAdmin`). Any Platform Administrator may invite or revoke Platform Administrator invitations; only the supreme one may remove another's administration rights, and the supreme one can't be removed. The development seed makes `SEED_PLATFORM_ADMIN_1` supreme when there is none; an operator transfers the role with `npm run db:transfer-supreme-admin -w @flame/api -- <email>` (the target must be an active Platform Administrator; one transaction; audited).

Roles combine: an Administrator who should review or approve also holds the Reviewer or Approver role. On top of the matrix, separation of duties is decided per record (§7.1).

## 7. Review and approval workflow

**Implemented for activity records** (Milestone 4, §7.1).

```
Draft → Submitted → Under Review → Awaiting Approval → Approved → (revision approved) Superseded
```

| From              | Step              | To                       | Who                                              |
| ----------------- | ----------------- | ------------------------ | ------------------------------------------------ |
| Draft             | submit            | Submitted                | `activity:submit`                                |
| Draft             | withdraw          | Withdrawn                | `activity:write`, with a reason                  |
| Submitted         | recall            | Draft                    | someone involved, before review                  |
| Submitted         | start review      | Under Review             | `activity:review`, not involved                  |
| Under Review      | release claim     | Submitted                | the claimant, or an Owner; reason                |
| Under Review      | forward           | Awaiting Approval        | the claimant                                     |
| Under Review      | return            | Needs Correction         | the claimant; reason                             |
| Awaiting Approval | approve           | Approved                 | `activity:approve`, not involved, not a reviewer |
| Awaiting Approval | reject            | Rejected (final)         | as approve; reason                               |
| Awaiting Approval | return            | Needs Correction         | as approve; reason                               |
| Needs Correction  | submit            | Submitted                | `activity:submit` (after any edits)              |
| Needs Correction  | withdraw          | Withdrawn                | `activity:write`, with a reason                  |
| Approved          | revise            | (new Draft, version + 1) | `activity:write`                                 |
| Approved          | revision approved | Superseded               | automatic, in the approval transaction           |

- Transitions are validated in the backend `workflow` service, with role checks per transition.
- A user cannot approve their own submission.
- Approved records are immutable; changes create a new version linked to the original.
- Comments, correction reasons, actors and timestamps are retained.
- Only approved records feed official reports.

### 7.1 Activity record review and approval (Milestone 4)

Decisions confirmed with the product owner on 2026-11-16.

- **States.** `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `NEEDS_CORRECTION`, `AWAITING_APPROVAL`, `APPROVED`, `REJECTED`, `SUPERSEDED`, `WITHDRAWN`. Values can be edited only in `DRAFT` and `NEEDS_CORRECTION`.
- **Unit.** Each record moves on its own. Lists offer bulk actions (submit, start review, forward, return, approve, reject); the API applies them record by record, each in its own transaction, and reports the outcome for every record, so one refusal doesn't hold back the rest.
- **Who does what** (§6). Submit and recall: `activity:submit`. Review: `activity:review` (Reviewer, Owner). Approve, reject, and return from approval: `activity:approve` (Approver, Owner). Release a claim: the reviewer holding it, or `activity:release-claim` (Owner).
- **Separation of duties** (three people per record). Anyone _involved_ in a record (created, edited or submitted it, in any round) can't review or approve it, and anyone who reviewed it (in any round) can't approve it. Involvement is read from the append-only history. A revision is a new record: who is involved is worked out for it alone. Refusals return 403 `SEPARATION_OF_DUTIES`; the record's `separationOfDuties` field explains it to a user whose role would otherwise allow the step.
- **Review claim.** A reviewer presses _Start review_; the record becomes `UNDER_REVIEW`, assigned to them. Only they can forward it or return it. An Owner can release a stuck claim (with a reason).
- **Recall.** Someone involved can pull a `SUBMITTED` record back to `DRAFT` until a review starts.
- **Corrections.** Reviewers and approvers can return a record (`NEEDS_CORRECTION`, reason required). Anyone with `activity:write` may correct and resubmit it; editing makes them involved.
- **Rejection** is final, with a required reason: the record is kept, read-only, and not used. To record the activity differently, enter a new record.
- **Withdrawal** is allowed only in `DRAFT` and `NEEDS_CORRECTION`. An approved record is never withdrawn, only revised.
- **Comments.** Required to return, reject and release a claim; optional otherwise. Kept in the history with the step.
- **Data-quality checks.** Submission is refused (409 `OVERLAP_BLOCKED`, listing the records) when the record overlaps a submitted, under-review, awaiting-approval or approved record of the same flare source and activity type; approval re-checks against approved records. The record a revision replaces never counts. Other warnings (rate × hours vs volume, no evidence) don't block, but the warnings at submission and at approval are stored with those steps and shown to reviewers and approvers.
- **Revisions.** _Revise_ on an approved record creates a new draft linked to it (`revisionOfId`, `version` + 1) with its values. At most one open revision per record (a partial unique index). The original stays `APPROVED`, and in use, until the revision is approved; then, in the same transaction, it becomes `SUPERSEDED`. A rejected or withdrawn revision leaves the original approved.
- **History.** `activity_record_events` records every creation, edit, step and comment (actor, time, from and to status). It is append-only: the app role has INSERT and SELECT only, and triggers reject UPDATE, DELETE and TRUNCATE even for the schema owner. Records entered before Milestone 4 were given a history built from their creator, their audited edits and their withdrawals. Every step is also in the audit log.
- **Database protection.** A trigger on `activity_records` rejects deletes (by anyone; the app role also lacks DELETE), inserts in any state but `DRAFT`, any transition not in the diagram above, value changes outside `DRAFT` and `NEEDS_CORRECTION`, and any change at all to approved, superseded, rejected and withdrawn records apart from `APPROVED → SUPERSEDED`. Identity and lineage (organisation, flare source, kind, creator, the record revised, version) never change; who approved a record can't be rewritten; claim and submission fields change only with a status change. Separation of duties also always counts the stored creator, in case a record's history is incomplete. CHECK constraints tie the claim, approval and superseded fields to their states.
- **Concurrency.** Each step locks the record (`FOR UPDATE`) and checks its state inside the transaction, so of two simultaneous actions one succeeds and the other gets 409. Submission and approval also lock the flare source, so overlapping records can't be submitted or approved side by side. Lock order: records (a revision before its original), then the flare source.
- **Interface.** The API lists what the requesting user may do with each record (`availableActions`); the web app shows only those buttons and the API checks again on every request. A _Review_ page (for reviewers, approvers and owners) has three queues: To review, My reviews and Awaiting approval, oldest submission first.
- **Out of scope.** Notifications, reports and calculations. Approved records are what official reports and calculations will use.

### 7.2 Membership and invitations (Milestone 6)

Decisions confirmed with the product owner on 2026-11-16, with review follow-ups on 2026-11-17. Code: `apps/api/src/modules/organisations` (members, invitations), `platform-admin`, `email`.

- **Membership states.** `ACTIVE`, `SUSPENDED`, `REMOVED`. Suspension and removal take effect on the member's next request (the organisation context accepts only ACTIVE memberships); reinstating returns SUSPENDED to ACTIVE. Memberships are never deleted (the app role has no DELETE and a trigger rejects it); a removed member can be invited again, and accepting reactivates the same row with the new roles.
- **Rules**, enforced in the service in one transaction with the organisation row locked and the caller's own roles re-read after the lock (so stale roles never decide): only an Owner grants the Owner role, by role change or invitation (403 `OWNER_ONLY`); nobody changes their own roles or suspends or removes themselves (403 `SELF_MEMBERSHIP_CHANGE`). Anyone with `members:manage` (Owners and Administrators) may take the Owner role away and suspend, reinstate or remove Owners, including the last one (decision 2026-11-16: there is no "last Owner" rule). Lock order: organisation, invitation, user; when releasing claims, calculations before activity records.
- **Dormant organisations.** An organisation with no ACTIVE member holding the Owner role is _dormant_. Nothing changes for its members, who keep working as before. The change that makes it dormant (roles changed, suspended or removed) is audited with `organisationDormant: true`. `GET /organisations/:organisationId` returns `dormant`, and the platform list shows it with any pending Owner invitation. The revival path is the Platform Administrator Owner invitation (§ Platform administration below); reinstating a suspended Owner also revives it.
- **Inviters who lose authority lose their invitations.** In the same transaction as the change, a member's valid invitations to the organisation are revoked: all of them when they are suspended or removed or no longer hold a role with `members:manage`, and those granting the Owner role when they lose it. A Platform Administrator who loses that status loses their valid Platform Administrator invitations and the platform Owner invitations they issued. Each is audited as `invitation.revoked` with a `reason` (`inviter_suspended`, `inviter_removed`, `inviter_lost_member_management`, `inviter_lost_owner_role`, `inviter_lost_platform_admin`) and the person who made the change as actor, and its queued email is cancelled. Reinstating someone does not bring their invitations back. Owner invitations a member issued as a Platform Administrator are not affected by their membership changes.
- **Removal** releases every review claim the member holds on the organisation's activity records and calculations (back to Submitted, with a `CLAIM_RELEASED` history step and an audit entry, as a manual release does). If the person then has no ACTIVE or SUSPENDED membership anywhere and is not a Platform Administrator, the account is disabled and all its sessions are revoked in the same transaction.
- **Invitations.** Kind `ORGANISATION` (with roles) or `PLATFORM_ADMIN`. The link is `${WEB_ORIGIN}/invite/<token>`; the token is 32 random bytes, only its SHA-256 hash is stored, and the raw token exists only in the queued email until it is sent. Valid 5 days. States `PENDING`, `ACCEPTED`, `DECLINED`, `REVOKED`, `EXPIRED`; a PENDING invitation past its expiry is reported as EXPIRED everywhere and flipped lazily. At most one PENDING invitation per (organisation, email) and per platform-administrator email (partial unique indexes). There is no re-send: while a valid invitation exists another is refused (409 `INVITATION_PENDING`); revoke it, then invite again. Inviting an active member is refused (409 `ALREADY_MEMBER`), and a suspended one too (409 `MEMBER_SUSPENDED`: reinstate instead). A trigger keeps what was offered immutable and final states frozen; invitations are never deleted.
- **Public endpoints** `/invitations/{lookup,accept,decline}` take the token in the body (never the URL, so it stays out of access logs) and need no sign-in; failed requests are rate-limited per client IP with the sign-in limits. CSRF: a foreign Origin is rejected, and a request carrying a session must send its CSRF token. Unknown tokens get a generic 404. Every transition is a conditional update on PENDING-and-not-expired with the row locked, so a token works once.
- **Accepting.** No account for the email: a name (1–200 characters) and password (12–256) create it, and a session is opened exactly as at sign-in. An account exists: either the request is signed in as that email (the session carries on), or the account's password is given and verified like a sign-in, which also re-enables a disabled account and opens a new session (a previous session is revoked). Otherwise 403 `INVITATION_SIGN_IN_REQUIRED` or `INVITATION_WRONG_ACCOUNT`. Only the password path re-enables an account: in signed-in mode the account must still be active and the session still live, checked inside the transaction (otherwise 401). The password check counts against the same per-account sign-in limiters as `/auth/login` (per account from one IP and per account overall, keyed on the invited email, sharing their stores), so guesses through either route count against both. Platform invitations set `isPlatformAdmin`.
- **Platform administration.** Platform Administrators list organisations (counts, `dormant`, and for dormant organisations the pending Owner invitation; no tenant data), create one (slug from the name, suffixed when taken) together with an Owner invitation, without becoming members, and may issue an Owner invitation to a dormant organisation (one at a time; revoke it to re-issue). These invitations are marked `issuedByPlatform` and can be accepted only while the organisation is still dormant, checked under the organisation lock (otherwise 409 `ORGANISATION_NOT_DORMANT`). One may go to an ACTIVE member, who keeps their roles and gains Owner; a SUSPENDED member is refused (409 `MEMBER_SUSPENDED`) until an Administrator reinstates them. Platform Administrators may revoke platform-issued Owner invitations at any time, and any Owner invitation of a dormant organisation. Supreme administrator: §6.
- **Email outbox.** `email_outbox` rows are written in the same transaction as the invitation. A worker in the API process (started by `server.ts`, stopped on shutdown, never started by tests) polls every 5 s and claims rows with a conditional update (PENDING → SENDING when due, or a SENDING claim older than 5 minutes), so several API instances never send the same row; it sends through Resend with the outbox id as the idempotency key. Failures retry with exponential backoff (30 s, doubling, at most 1 h apart); after 8 attempts the row is FAILED and audited (`email.failed`). Emails of invitations revoked, declined, accepted or expired before sending are `CANCELLED` (never sent). The link is erased from the payload once sent, and a CHECK guarantees FAILED and CANCELLED rows hold no link. Invitations show delivery as `QUEUED`, `SENT`, `FAILED` or `CANCELLED`. In development without `RESEND_API_KEY`, emails stay in the outbox with their links and are listed at `GET /api/v1/dev/mailbox`. The route is mounted only when `NODE_ENV=development` and no Resend key is set, and it answers only connections from this machine (the socket address 127.0.0.1 or ::1, never `X-Forwarded-For`); anything else gets 404. Production refuses to start without `RESEND_API_KEY` and `EMAIL_FROM`.
- **Audit.** Invitation created, revoked (by hand or automatically, with a reason), accepted and declined; roles changed; member suspended, reinstated and removed; claims released; account created, disabled and re-enabled; Platform Administrator granted and removed; organisation created; supreme administrator transferred; email failed. Tokens, links and passwords are never logged or audited.

### 7.3 Password reset and account (Milestone 7)

Decisions confirmed with the product owner on 2026-11-17. Code: `apps/api/src/modules/auth` (`account.service.ts`, `account.routes.ts`), `email`; web pages `/forgot-password`, `/reset-password/:token`, `/account`.

- **Requesting a link.** `POST /auth/password-reset/request {email}` is public and always answers `202` with the same body. The response is sent before any account lookup, so its timing does not reveal whether the email has an account. Only an `ACTIVE` account gets a link. For an unknown email or a `DISABLED` account (one whose last membership was removed), nothing is stored or sent; such people need a new invitation (§7.2). Requests are rate-limited, counting every request, per client IP (sign-in IP limit) and per email address (per-account-from-one-IP limit, default 5 per 15 minutes), which caps how many reset emails one inbox can receive.
- **Links.** `password_resets` holds only the SHA-256 hash of a 32-byte random token. The link is `${WEB_ORIGIN}/reset-password/<token>` and is valid for **15 minutes**. States are `PENDING`, `USED` and `CANCELLED`. There is at most one `PENDING` link per account (partial unique index): a new request cancels the previous link and its unsent email. A trigger keeps the account, token and expiry immutable and final states frozen; rows are never deleted, because the app role has no DELETE. The email belongs to its link (`email_outbox.passwordResetId`), and the worker cancels it instead of sending once the link is used, cancelled or expired.
- **Using a link.** `POST /auth/password-reset/complete {token, password}` is public, with the token in the body. The new password must be 12–256 characters and differ from the current one. The link is consumed by a conditional update on `PENDING`-and-not-expired with the user row locked, so it works once. In the same transaction the password is replaced, **every session is revoked** (no automatic sign-in) and a "password changed" email is queued. If the account was disabled after the link was sent, the link is cancelled and refused. Unknown, used, cancelled and expired links all get 400 `PASSWORD_RESET_INVALID`. Failed attempts are rate-limited per client IP. If the browser's own session belonged to that account, its cookie is cleared.
- **Account page.** `PATCH /account {name}` changes the signed-in person's name (1–200 characters, trimmed). This includes Platform Administrators, and an unchanged name changes nothing. `POST /account/password {currentPassword, newPassword}` checks the current password like a sign-in, so wrong guesses count against the same per-account sign-in limiters as `/auth/login`. It then replaces the password, revokes every **other** session, keeps the current one and queues the "password changed" email. A wrong current password gives a field error on `currentPassword` and is audited. The email address cannot be changed (deferred).
- **Audit.** `auth.password_reset_requested` (only when a link is actually issued; no actor), `auth.password_reset_completed` (no actor; with the number of revoked sessions), `auth.password_changed`, `auth.password_change_failed`, and `user.name_changed` with the old and new name. Tokens, links and passwords are never logged or audited. The reset and invitation pages carry their token in the page URL, so the web app sends no `Referer` (`<meta name="referrer" content="no-referrer">`) and the API redacts the `Referer` header from request logs.
- **Out of scope.** Changing the email address, session lists per device, and other notifications.

## 8. Calculation integrity

**Implemented** (Milestone 3, §8.1). Each calculation result stores: emission-factor identifiers and versions, factor sources, methodology and version, GWP values and source, original and standardised inputs, assumptions, formula, calculation timestamp and calculation version.

- Recalculation creates a new version; historical results are never overwritten.
- Calculations are blocked when inputs required by the methodology are missing.
- No hardcoded factors. The illustrative "1 MMscf ≈ 55 tCO2e" figure must not be used as an approved factor.

### 8.1 Emissions calculations and the methodology registry (Milestone 3)

Decisions confirmed with the product owner on 2026-11-16, built on the reference in `.claude/skills/flare-calculator-helper/SKILL.md`. The values were checked against the source documents before use: IPCC 2006 Vol. 2 Ch. 4 (current corrected PDF), API Compendium (2009) §4.6, and the GHG Protocol's tabulation of AR5 GWPs.

- **Methodology editions.** Every rule and number lives in a numbered edition of the methodology `flame-flaring-venting` (`methodology_editions`, `methodology_parameters`), not in code. An edition holds the overview, each route's formulas, every decision with its reason and references, the limitations, and every number with its source organisation, document, edition, page/table/equation, URL and the date it was checked. Edition 1 is loaded by the migration as a **draft**; nothing can be calculated until a Platform Administrator approves an edition.
- **Who maintains it.** Platform Administrators. One prepares a draft (from an approved or superseded edition); a different one approves it. Anyone who created or edited a draft (read from the audit log) can't approve it; a CHECK constraint also stops the creator approving. Approving supersedes the previous edition, which stays published. Approved, superseded and withdrawn editions never change (trigger, even for the schema owner); only drafts are edited or withdrawn. One draft per methodology at a time. Every value must be greater than zero and a percentage at most 100, checked on each edit and again at approval. While no edition has ever been approved, a draft may be started from a withdrawn one (so withdrawing edition 1 is never a dead end).
- **Public.** Approved and superseded editions (never drafts or withdrawn ones, and without naming the administrators involved) are readable without signing in at `/methodology` (API `GET /methodology/editions[/:id]`), so users, auditors and regulators can see how every figure is produced. Each decision and number has an anchor; a calculation's trace links to the exact number in the edition it used.
- **Edition 1 numbers.** 42.3 × 10⁻³ kmol/m³ (IPCC p. 4.45; the exact ideal-gas value is not used, so results match IPCC's own arithmetic); molecular weights CH₄ 16.043, CO₂ 44.011; carbon numbers 1–5 (C₆+ from the analysis, no default); API defaults 98% carbon conversion, 2% uncombusted CH₄ for production and 0.5% for refinery flares; IPCC reference-case factors CO₂ 2.0, CH₄ 0.012, N₂O 0.000023 Gg per 10⁶ m³ flared (Tables 4.2.4/4.2.5 footnote e; the N₂O value was checked in four places and confirmed by the product owner); AR5 100-year GWPs CO₂ 1, CH₄ 28, N₂O 265 (the AR5 fossil-methane value 30 is not used); exact unit conversions.
- **Routes.** _Composition flaring_ (primary): CO₂ from the hydrocarbon carbon converted at the efficiency plus the CO₂ already in the gas (API Eq. 4-15), unburned CH₄ (API Eq. 4-16), N₂O from the IPCC factor per volume flared. _IPCC reference-case flaring_: the three factors per volume flared, only with a recorded reason, labelled Estimated. _Composition venting_: all CH₄ and CO₂ in the gas, no combustion, no N₂O; gas through an unlit flare is recorded as venting. Production-based IPCC Tier 2 and "other gas release" are not offered.
- **Inputs.** _Gas analyses_ per flare source: sample date, report reference, the date from which they apply, mole % of 12 components, C₆+ carbon number required when C₆+ > 0; the total must be 100% ± 0.5% as entered and is never rescaled. _Flare efficiency_ per flare source: measured test (with test date) or vendor specification (carbon-to-CO₂ % and uncombusted-CH₄ %), or a design requirement such as NUPRC's 98% DRE, which is recorded but never used as performance. Flare sources are marked **production** or **refinery**, which decides the default. Inputs are never edited; a correction is a new record and a mistaken one is withdrawn with a reason. A calculation uses the latest active record valid on or before the period start, and refuses when a different record starts inside the period.
- **Running a calculation.** One calculation per **approved** activity record (`POST /activity-records/:id/calculations`, `calculation:run`), using the approved edition. Volume: the record's standardised total volume, else its derived volume; a rate without operating hours can't be calculated. The person running it chooses the route and, for composition flaring, the flare's recorded efficiency or the methodology default. Missing inputs return 409 `CALCULATION_BLOCKED` with a list of what is needed; nothing is assumed. Arithmetic: 40 significant digits; results stored to 20 decimal places.
- **What a calculation keeps** (immutable; trigger): the edition, route, inputs snapshot (activity values, analysis, efficiency, and every edition parameter used with its source), the step-by-step trace (formula, substituted values, each value's origin or parameter key, result), engine version, CO₂, CH₄, N₂O (null for venting) in tonnes and tCO₂e, the data-quality label and its reasons.
- **Data quality.** _Measured basis_ only when the activity was measured, the composition measured and (for flaring) the efficiency tested or vendor-specified; otherwise _Estimated_, with the reasons listed. The label always appears next to the figure. tCO₂e is labelled as emissions, never as carbon credits.
- **Versions and review.** One open calculation per record (partial unique index). States: Calculated → Submitted → Under Review (claimed) → Awaiting Approval → Approved; Rejected (final, reason) and Discarded (before submission, reason). A correction is a new version; approving a version supersedes the previously approved one. Three-person rule: whoever ran or submitted it can't review or approve it, and its reviewer can't approve it (403 `SEPARATION_OF_DUTIES`). A calculation of an activity record that has since been revised is flagged and can't be approved (approval locks the record, so it can't race the revision's approval). A CHECK stops the person who ran a calculation being recorded as its approver, and the submission time and review claim change only on the transitions that set them. Every step is in `calculation_events` (append-only) and the audit log.
- **Interface.** Flare source page: gas analyses and flare efficiency. Approved activity record: its calculation versions and _Calculate emissions_. Calculation page: result, quality reasons, inputs, the step-by-step trace with links into the methodology edition, actions and history. Review page: calculation queues. `/methodology` (public) and `/admin/methodology` (Platform Administrators).
- **Out of scope.** Reports and period totals (now §8.2), NUPRC templates, uncertainty, evidence uploads, the production-based route, other gas releases.

### 8.2 Emissions reporting (Milestone 5)

Decisions confirmed with the product owner on 2026-11-16. Module `apps/api/src/modules/reporting`; pages `/o/:id/reports` and `/o/:id/reports/print`.

- **Live, not issued.** Reports are recomputed from the database on every request; nothing is stored and there is no migration. Issued, frozen reports with their own review and approval come later with the NUPRC templates.
- **What counts.** A figure counts only when its calculation is `APPROVED` **and** its activity record is still `APPROVED`. When a revision of a record is approved the original becomes `SUPERSEDED` and drops out with its calculation; the revision counts once its own calculation is approved. While a revision is open, the approved original and its calculation keep counting (shown as an open revision). Nothing pending ever contributes tCO₂e.
- **Periods.** Calendar months (`2026-03`), calendar quarters (`2026-Q1`, Q1 = Jan–Mar) and calendar years (`2026`), from 2000, plus a 12-month trend (`GET …/reports/emissions/trend?endMonth=YYYY-MM`; months before 2000 are left out, so a trend ending in 2000 is shorter). Records are placed by their stored local dates (the facility time zone they were entered in). A record counts only in a period that contains **all** of its dates; one crossing the boundary is not pro-rated or moved, but listed under the period as _not placed_, and it counts in any longer period that contains it (a record crossing 31 December is not placed in either year).
- **Figures.** Per activity type: CO₂, CH₄ and N₂O in tonnes and tCO₂e, split into _Measured basis_ and _Estimated_; N₂O is `null` (“not applicable”) when only venting contributes, never 0. Emissions (tCO₂e, with its CO₂/CH₄/N₂O and quality split) are also totalled across types, labelled as the sum of the rows; that total carries no volume (`CrossTypeTotalDto`), because volumes are never added across types (the CSV says “not added across activity types” in that cell). Two volumes per type, MMscf at ISO 13443: _volume calculated_ (behind the approved tCO₂e) and _approved volume_ (every approved record, calculated or not). Sums are exact decimal arithmetic on the stored 20-decimal-place values (80 significant digits, no rounding); the display rounds to 3 decimal places and the CSV carries full precision.
- **Coverage.** Counts only, for records placed in the period: approved records, how many have an approved calculation, calculations in progress, records not yet approved (draft to awaiting approval, revisions counted separately as open revisions), recalculations in progress on records that already have an approved version (which keeps counting) and approved records without a volume (a rate without hours). Day coverage per flare source and activity type: distinct days covered by approved placed records, out of the period’s days up to today in the facility’s time zone. A day without a record is never treated as zero.
- **Drill-down and filters.** Organisation → facility → asset → flare source → the approved calculations (linked). Filters: facility (must belong to the organisation, else 404) and activity type. Archived facilities and flare sources stay in historical totals.
- **Methodology.** The editions behind the figures are listed with their GWPs and link to the public methodology; mixing editions is allowed, and the report warns when their GWP values differ (`gwpConsistent`).
- **Access.** `report:read` (all organisation roles). The organisation always comes from the verified membership; another organisation’s path returns 404.
- **CSV** (`GET …/reports/emissions.csv?period=…`): UTF-8 with a byte-order mark; header lines with the basis label (“Emissions (tCO₂e). Approved calculations only. Not carbon credits.”), organisation, period, generation time, filters and editions; then the summary, the per-flare-source rows, every calculation included (ID, version, edition, quality, exact values) and the records not placed. Cells starting with `= + - @`, tab or carriage return are prefixed with `'` so spreadsheets never run them. Each export is audited (`report.exported`, with period, filters and count); viewing is not audited.
- **Print view.** The same content plus the list of calculations, with the app shell hidden and tables fitted to the page width in print; the browser saves it as PDF (no PDF library).
- **Trend chart.** Hand-built SVG (no chart library): approved tCO₂e per month stacked by activity type, one fixed brand colour per type, with a legend, a readout on hover, tap or keyboard focus (each month column is focusable and named for screen readers), and a table view carrying the same values. Colours (Patina routine, amber non-routine, Oxide emergency flaring, a Basalt neutral for venting) were measured: every pair separates (ΔE ≥ 22.7) and every mark is ≥ 3:1 on white; segments are still separated by a gap.
- **Known limits.** The facility filter lists up to 100 facilities. Reports aggregate in the API process; very large organisations may later need database-side aggregation or issued snapshots.
- **Out of scope.** NUPRC templates, issued/frozen reports, evidence uploads, other gas releases (not calculated, so they show volumes and coverage only).

### 8.3 NUPRC reports (Milestone 9)

Decisions confirmed with the product owner on 2026-11-17 and 2026-11-20. Code: `apps/api/src/modules/reporting` (`nuprc.service.ts`, `issued-reports.service.ts`, `nuprc.routes.ts`, `nuprc-csv.ts`); web `/o/:organisationId/reports/nuprc` and `/reports/issued/:id`.

- **Sources.**
  - The quarterly inventory follows NUPRC's _Guidance Template for GHG Emissions Inventory Reporting in Upstream Oil and Gas Operations_ (2026), which the product owner confirmed. Appendix C uses its 20 column headings in order.
  - The monthly log follows regulation 20 of the _Gas Flaring, Venting and Methane Emissions (Prevention of Waste and Pollution) Regulations, 2023_. Its exact layout belongs to NUPRC's _Metering and Data Collection Standards_, which are not published, so the log carries the items regulation 20(4) names and says so.
  - Flame produces the data parts only. Reports never claim regulatory compliance or verification.
- **Data.**
  - Only approved activity records wholly inside the period (§8.2 placement), with their approved calculations, are counted.
  - Records still in review, approved records without an approved calculation, and records crossing the period boundary appear as coverage, never in the figures.
  - CO2, CH4 and N2O are each calculation's gas tonnes × its edition's GWP. TOTAL is the approved calculations' tCO2e, so they can differ in the last decimal place.
  - Flaring covers routine, non-routine and emergency flaring; Venting covers venting. Other releases, combustion, fugitives, production-based intensity and uncertainty are listed as not recorded.
- **Quarterly inventory.**
  - Appendix C has one row per month, facility, emission source and equipment type ("Flare Point (<flare type>)" or "Vent").
  - A record that crosses a month boundary inside the quarter gets its own row, whose MONTH names the span (e.g. "July–August"), with a comment. It is never split between months (decision 2026-11-20), so Appendix C adds up to the quarter totals.
  - Appendix A covers flaring and venting sources, with Uncertainty "Not quantified in Flame".
  - The report also has emissions by gas per facility and source, activity totals in MMscf, and the editions used with their GWPs.
  - Missing optional fields (organisation abbreviation; facility terrain, concession, field name, facility type, segment, coordinates) are left blank and named in COMMENTS, never guessed.
  - FRAMEWORK ADOPTED is the route's `reportingTier`, set by Platform Administrators in a methodology edition with its source. When an edition has none, the column stays blank with a note. Flame never assigns a tier.
- **Monthly log.**
  - Each approved flaring or venting record in the month becomes an entry: dates, start time, duration, standardised rate and volume, the volume as entered, gas source or type, and measured or estimated.
  - Venting entries also carry CH4 tCO2e from their approved calculation.
  - Totals are kept per flare source. Start time and gas source are optional fields on activity records.
  - An approved event that crosses a month boundary is listed in every month it touches, flagged "spans months", and left out of those months' totals. Volumes are never split (decision 2026-11-20).
- **CSV.**
  - Quarterly parts: `appendix-c` (NUPRC's exact header, to paste into NUPRC's Excel template), `appendix-a` and `gas-totals`.
  - Monthly parts: `entries` and `totals`.
  - Files are UTF-8 with a BOM, formula-safe, and every download is audited (`report.exported`). There is no Excel output for now (decision 2026-11-20).
- **Issued reports** (`issued_reports`).
  - With `report:issue` (Owner, Approver), a report for a period that has ended (by the Nigerian calendar date, Africa/Lagos; rule confirmed 2026-11-20) can be issued as a frozen snapshot of the full report. Its status is `AWAITING_APPROVAL`.
  - A different Owner or Approver approves it or rejects it with a comment. Separation of duties is enforced in the service and by a CHECK constraint.
  - A correction is a new version with a reason. When approved, it supersedes the previous approved version. At most one version per period awaits approval, and one is approved (partial unique indexes).
  - The submission to NUPRC is recorded once, with its date and NUPRC's reference, if any. There are no deadline reminders.
  - A trigger keeps what was issued unchanged and statuses moving forward only. Issued reports are never deleted, and RLS applies.
  - CSVs of an issued report come from its snapshot. Unless the version is approved, its file name carries its status (e.g. `-v1-REJECTED-`), and the page warns that it must not be submitted. Audited: `report.issued`, `report.approved`, `report.rejected`, `report.submission_recorded`.

## 9. Audit logging

**Implemented.** Append-only `AuditLog` table. It is protected in two layers: the API connects as a restricted role with only INSERT and SELECT on it, and triggers reject row UPDATE, DELETE and TRUNCATE even for the schema owner (who alone could disable them). Each entry records actor, organisation, action, entity type and id, timestamp, and change summary. Covers creation, submission, review, corrections, approval, rejection, factor changes, calculations and permission changes, and membership, invitation and platform-administration changes (§7.2).

## 10. Evidence

Files live in object storage; PostgreSQL holds metadata and relationships. Uploads are type- and size-checked, access is authorised per request and served through short-lived signed URLs. Evidence linked to approved records is not deleted.

## 11. Security baseline

- Server-side sessions stored in PostgreSQL, HTTP-only `Secure` `SameSite` cookies, expiry and revocation.
- Password hashing with argon2id (`argon2`). Unknown-email logins burn equivalent hashing time, and all failures return the same message.
- CSRF protection, security headers (helmet), and rate limiting on failed sign-ins at three levels: per client IP; per account from one IP (strict, default 5); and per account from all IPs combined (ceiling, default 20). An attacker who knows an email can only lock their own address out of that account; reaching the account-wide ceiling requires failures from many addresses. Successful sign-ins never count. The two per-account limiters also cover the password check when an invitation is accepted with an existing account (§7.2) and the current-password check of a password change (§7.3), sharing the same counts. The first blocked attempt of each window is audited as `auth.login_rate_limited` (no actor; the targeted account as entity), so lockouts and attacks are visible without one audit row per blocked request. The limiter store is in memory, so limits are per API instance.
- Structured JSON logging (no `console.log`); never log passwords, tokens or sensitive personal data.
- Secrets only in environment variables; `.env` files are git-ignored.
- Least-privilege database access. Migrations run as the schema owner (`MIGRATION_DATABASE_URL`). The API connects as a login in the `flame_app` role (`DATABASE_URL`), created with `npm run db:create-app-user -w @flame/api`. That command only creates a new login or reuses a plain one: it refuses an existing role that is a superuser, can create roles or databases, has replication or RLS-bypass rights, or owns any object. It sends the password inside `CREATE/ALTER ROLE`, so avoid running it while PostgreSQL logs DDL statements (`log_statement = ddl` or `all`). That role has CRUD on application tables, INSERT and SELECT only on `audit_logs`, no access to `_prisma_migrations`, and cannot alter tables, drop or disable triggers, or create tables. New tables get the same CRUD grants through default privileges. Any append-only table (e.g. calculation versions, approvals) must `REVOKE UPDATE, DELETE` in its migration, and every table must be listed with its approved privileges in `audit-hardening.test.ts`: the test fails for any table whose app privileges differ from that list, including a newly added one. The API checks its role at startup: in production it refuses to start if it can modify or owns `audit_logs`; in development it logs a warning. On hosted PostgreSQL without `CREATEROLE`, create the `flame_app` role before the first migration.
- PostgreSQL Row-Level Security (Milestone 8, decisions 2026-11-17). RLS is defence in depth behind the backend's own checks, not a replacement for them.
  - **Coverage.** RLS is enabled on the 13 tables that hold organisation data: `organisations`, `memberships`, `invitations`, `facilities`, `assets`, `flare_sources`, `activity_records`, `activity_record_events`, `gas_compositions`, `flare_efficiencies`, `calculations`, `calculation_events` and `audit_logs`. `users`, `sessions`, `email_outbox`, `password_resets` and the methodology tables are not organisation data and stay outside it.
  - **Settings.** Each policy calls `flame_rls_allows(organisationId)`, which reads two transaction-local settings: `flame.scope` (`organisation` or `system`) and `flame.organisation_id`.
  - **Where the scope comes from.** `apps/api/src/lib/db-scope.ts` holds the scope for the current work in AsyncLocalStorage. A thin wrapper around the pg driver adapter (`lib/prisma.ts`) applies it before the first statement of every transaction, and again if it changes mid-transaction. A scoped query outside a transaction runs in a short transaction of its own, so a setting never outlives its transaction or leaks to the next user of a pooled connection.
  - **No request batching.** Prisma normally batches `findUnique` calls made in the same tick and sends them from one callback, which carries the async context, and so the scope, of whichever request scheduled it. The client turns that batching off so every request runs in its caller's scope. Array transactions (`$transaction([...])`) need batching, so they are refused while a scope is active; the code uses interactive transactions. This hooks a Prisma internal: if an upgrade changes it, the client refuses to start.
  - **Fail closed.** With no scope, no organisation rows are visible and none can be written.
  - **Organisation scope.** Organisation routes run in the scope of the organisation in the URL, set by `requireOrganisation` before its membership check, so even that check runs under RLS. A query that forgets its organisation filter therefore still cannot read or change another tenant's rows.
  - **System scope.** Code that legitimately works across organisations calls `withSystemScope(reason)`. The allowed reasons are `session` (listing the signed-in user's memberships), `invitation-link` (public invitation endpoints), `platform-admin` (after the administrator check), `email-worker`, `membership-check` (whether a removed member still belongs anywhere), and `operator-script` (seeding and the supreme-administrator transfer). `db-scope.test.ts` pins the call sites, so a new one fails the tests until it is reviewed.
  - **Audit log.** Entries without an organisation, such as sign-in and account events, can be written in any scope but read only in system scope. `recordAudit` therefore never reads its row back.
  - **Owner and app role.** RLS is enabled, not forced, so the schema owner (migrations, the test reset) is unaffected. At startup the API checks its own role: it refuses to start in production (and warns in development) if the role is a superuser or has BYPASSRLS, owns a protected table, or finds RLS off on any of the 13 tables.
  - **Idle transactions.** Every connection the API, the scripts and the tests open sets `idle_in_transaction_session_timeout` to 60 seconds (`lib/prisma.ts`), so PostgreSQL ends any transaction left idle (e.g. by a crashed request) and its locks are released (decision 2026-11-20).
  - **Cost.** A scoped query outside a transaction takes three extra round trips: `BEGIN`, the settings and `COMMIT`.

## 12. Environments and tooling

| Concern         | Choice                                                                                                                                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager | npm workspaces                                                                                                                                                                                                                                                             |
| Node            | 24.x                                                                                                                                                                                                                                                                       |
| Database        | PostgreSQL 15 or later (local: PostgreSQL 18 in Docker, `docker-compose.yml`). 15+ is required because the app role relies on `PUBLIC` having no `CREATE` on the `public` schema by default                                                                                |
| Migrations      | `prisma migrate dev` locally; `prisma migrate deploy` in CI/production. Prisma does not run migrations in a transaction, so every `migration.sql` is wrapped in `BEGIN; … COMMIT;` by hand: it applies completely or not at all, and constraints are never briefly missing |
| Tests           | Vitest + Supertest against a real PostgreSQL test database (`*_test`, created and migrated automatically)                                                                                                                                                                  |
| Lint / format   | ESLint (typescript-eslint strict, type-checked) and Prettier                                                                                                                                                                                                               |
| Hosting         | Heroku (one Eco dyno serving the API and the built web app, EU region) and Neon PostgreSQL (EU), decided 2026-11-20. See §12.3                                                                                                                                             |

### 12.1 Production deployment checklist

- Run migrations as the schema owner (`MIGRATION_DATABASE_URL`), then `npm run db:create-app-user -w @flame/api`, and point `DATABASE_URL` at that restricted login. The API refuses to start in production otherwise.
- If the migration user cannot `CREATEROLE` (common on hosted PostgreSQL), a database administrator must, before the first migration:
  1. `CREATE ROLE flame_app NOLOGIN;`
  2. `CREATE ROLE <app_login> LOGIN PASSWORD '<secret>' IN ROLE flame_app;` (the login used in `DATABASE_URL`; `db:create-app-user` cannot do this without `CREATEROLE`)
  3. Either `GRANT flame_app TO <migration_user> WITH ADMIN OPTION;` or grant membership themselves, because on PostgreSQL 16+ adding members requires `ADMIN OPTION` on the role.
     The migration then finds `flame_app` already present and only applies its grants.
- `package-lock.json` records no `@esbuild/*` platform binaries (an npm bug with optional platform packages), so `tsx` may fail on a fresh install, including on the host. The build (`tsc`, Vite) and `npm start` do not need it. Locally, `npm install @esbuild/<platform>@<esbuild version> --no-save` restores it.
- `db:create-app-user` runs with `tsx`, a development dependency. If the production host installs with `--omit=dev`, run it from an operator machine with `MIGRATION_DATABASE_URL` and `DATABASE_URL` set for the production database.
- Run tests only against a dedicated or throwaway PostgreSQL server: the test setup creates a `flame_app_test` login (fresh random password each run) that is a member of the cluster-wide `flame_app` role.
- Set `TRUST_PROXY` to the number of reverse-proxy hops (1 on Heroku). The API logs a warning if it sees `X-Forwarded-For` while this is 0.
- Before running more than one API instance, move the sign-in rate-limit store to a shared store (e.g. PostgreSQL or Redis).
- Set `NODE_ENV=production` so cookies are `Secure` and use the `__Host-` prefix, and set `WEB_ORIGIN` to the deployed web app's origin (invitation links are built from it).
- Set `RESEND_API_KEY` and `EMAIL_FROM`; the API refuses to start in production without them (the development mailbox is therefore never mounted there). Before inviting real customers, verify a sending domain in Resend and send from it: the test sender `onboarding@resend.dev` only delivers to the Resend account owner's own address.
- The email worker runs inside each API instance and is safe with several instances; no separate process is needed.

### 12.2 API documentation

Decisions 2026-11-17: no new packages; public.

- **Spec.** `GET /api/v1/openapi.json` serves an OpenAPI 3.1 description, built by `apps/api/src/docs/openapi.ts` from a table of every endpoint: method, path, tag, summary, access level, and the permission it needs (shown with the roles that hold it). Organisation, Platform Administrator, signed-in and public endpoints are distinguished.
- **Request schemas.** Request bodies and query parameters are generated with `z.toJSONSchema` from the same Zod validators the routes use.
- **Response schemas.** Response bodies come from the `@flame/shared` types. `apps/api/scripts/api-schemas.ts` converts them with the TypeScript compiler, which is already a dev dependency, into the committed `src/docs/schemas.generated.ts`. After changing a shared type, run `npm run docs:schemas -w @flame/api`.
- **Checks.** `src/docs/openapi.test.ts` fails when an Express route is undocumented, when a documented route does not exist, when the generated schemas are stale, or when a reference does not resolve. The OpenAPI description itself (`openapi.json`) is the only route left out. The development mailbox is mounted only in development, so the tests never see it.
- **Viewer.** `/docs` in the web app (public, linked from the landing page footer) renders the description with Swagger UI from jsDelivr. The version is pinned and both files are checked with Subresource Integrity hashes. To upgrade, change the version and recompute the hashes in `api-docs-page.tsx`. "Try it out" is switched off, so the page only reads.

### 12.3 Heroku and Neon deployment

Decisions 2026-11-20: Heroku hosts one app; the database is Neon, not Heroku Postgres, because Heroku's Essential plans give a single owner login that cannot create roles, so `flame_app`, the restricted app login and therefore Row-Level Security and the append-only tables could not work there.

- **One origin.** `herokuapp.com` is a public suffix, so a separate web app would be a different site and the session cookie would not be sent. In production the API serves `apps/web/dist` itself (`src/middleware/web-app.ts`): hashed files under `/assets/` cached for a year, every other `GET` outside `/api/` gets `index.html` (no-cache). The Content Security Policy is Helmet's default plus `https://cdn.jsdelivr.net` for the pinned, integrity-checked Swagger UI on `/docs`.
- **Build.** The Heroku Node.js buildpack runs `npm ci` and the root `build` script (shared, API, web), then removes devDependencies. `prisma` is a runtime dependency so the release step can migrate. Node is pinned to `24.x` (`engines`).
- **`Procfile`.** `web: node apps/api/dist/server.js`; `release: npm run prisma:deploy -w @flame/api` applies migrations as `MIGRATION_DATABASE_URL` before each new release goes live.
- **Neon connection strings.** Use the **direct** host (no `-pooler` in the host name): the API sets `idle_in_transaction_session_timeout` as a connection parameter, which the pooler does not accept, and migrations need a session. Keep `sslmode=require` on the owner URL (Prisma's migration engine) and use `sslmode=verify-full` on the app login URL (what `pg` does today; avoids its deprecation warning). URL-encode special characters in passwords. The project is linked with the Neon CLI (`neon.ts`, git-ignored `.neon`); `neon deploy` pulls Neon's variables into the git-ignored root `.env.local`, where `DATABASE_URL_UNPOOLED` is the owner on the direct host (Flame's `MIGRATION_DATABASE_URL`). Neon's pooled `DATABASE_URL` there is not used by Flame.

**Heroku config vars:** `NODE_ENV=production`, `DATABASE_URL` (restricted app login), `MIGRATION_DATABASE_URL` (Neon owner, for the release step), `WEB_ORIGIN` (the exact `https://…herokuapp.com` URL Heroku shows, no trailing slash), `TRUST_PROXY=1`, `RESEND_API_KEY`, `EMAIL_FROM`, `LOG_LEVEL=info`. Heroku sets `PORT`.

**First deployment** (operator PC, PowerShell, from `apps/api`). Variables set in the shell take precedence over `apps/api/.env`; check that Prisma prints the Neon host, not `localhost`. Alternatively keep both URLs in the git-ignored `apps/api/.env.production` and run each command with `node --env-file=.env.production …` / `npx tsx --env-file=.env.production …` (done 2026-11-20 for the first setup).

1. Neon: create a project in an EU region; copy the owner's direct connection string.
2. Migrate, then create the app login and the first Platform Administrators:
   ```powershell
   $env:MIGRATION_DATABASE_URL = "<Neon owner, direct>"
   $env:DATABASE_URL = "postgresql://flame_app_user:<new password>@<same host>/<db>?sslmode=require"
   npx prisma migrate deploy
   npm run db:create-app-user
   $env:PLATFORM_ADMIN_1_EMAIL = "..."; $env:PLATFORM_ADMIN_1_PASSWORD = "..."
   $env:PLATFORM_ADMIN_2_EMAIL = "..."; $env:PLATFORM_ADMIN_2_PASSWORD = "..."
   npm run db:bootstrap-admins
   ```
   `db:bootstrap-admins` never reads `.env`. It creates Platform Administrators only (administrator 1 supreme if none exists), is safe to re-run, never resets a password, refuses to promote an existing non-administrator, and audits each step (`platform_admin.bootstrapped`, `platform_admin.supreme_transferred`, `via: operator_script`).
3. Heroku: `heroku create <name> --region eu`, set the config vars, `git push heroku main`, then `heroku ps:type web=eco`.
4. Sign in as an administrator; the migrations ship methodology edition 1 as a draft, which a Platform Administrator who did not prepare it approves. Then create the first organisation and invite its owner.

**Production data.** Nothing else is seeded: organisations come from administrator invitations, and no operational or emissions data is ever seeded. The development seed (`db:seed`) refuses to run in production.

**Limits.** An Eco dyno sleeps after 30 minutes without traffic; queued emails stay in the outbox and are sent when it wakes. Until a sending domain is verified in Resend, `EMAIL_FROM` may be `Flame <onboarding@resend.dev>`, which delivers only to the Resend account owner's address.

## 13. Open decisions

- Review and approval permissions resolved 2026-11-16 (§6, §7.1); activity-data permissions 2026-11-15 (§6, §4.1).
- User invitation and membership management flow resolved 2026-11-16 (§6, §7.2).
- OpenAPI documentation resolved 2026-11-17 (§12.2).
- PostgreSQL RLS resolved 2026-11-17 (§11).
- Methodology and emission-factor sources resolved 2026-11-16 (§8.1, edition 1); later changes are new editions.
- Object-storage provider confirmation.
