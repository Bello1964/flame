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
| `auth`             | Sign-in, sign-out, server-side sessions, password hashing, session revocation, CSRF                           |
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

| Method           | Path                                                                                                                                           | Permission                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| POST             | `/auth/login`                                                                                                                                  | public, rate-limited                   |
| GET              | `/auth/session`                                                                                                                                | signed in                              |
| POST             | `/auth/logout`, `/auth/logout-all`                                                                                                             | signed in                              |
| GET              | `/organisations/:organisationId`                                                                                                               | `organisation:read`                    |
| GET              | `/organisations/:organisationId/{facilities,assets,flare-sources}` (paged, `q`, `status`, parent filter)                                       | `hierarchy:read`                       |
| GET              | `/organisations/:organisationId/{facilities,assets,flare-sources}/:id`                                                                         | `hierarchy:read`                       |
| POST             | `/organisations/:organisationId/{facilities,assets,flare-sources}`                                                                             | `hierarchy:write`                      |
| PATCH            | `/organisations/:organisationId/{facilities,assets,flare-sources}/:id`                                                                         | `hierarchy:write`                      |
| POST             | `/organisations/:organisationId/{facilities,assets,flare-sources}/:id/archive`                                                                 | `hierarchy:write`                      |
| GET              | `/organisations/:organisationId/activity-records` (paged; `status` = a status, `CURRENT` (default) or `ALL`; `claimedBy=me`; `sort=submitted`) | `activity:read`                        |
| GET              | `/organisations/:organisationId/activity-records/:id`, `/:id/history`                                                                          | `activity:read`                        |
| POST, PATCH      | `/organisations/:organisationId/activity-records`, `/:id`, `/:id/withdraw`                                                                     | `activity:write`                       |
| POST             | `/organisations/:organisationId/activity-records/:id/{submit,recall}`                                                                          | `activity:submit`                      |
| POST             | `/organisations/:organisationId/activity-records/:id/{start-review,forward}`                                                                   | `activity:review`                      |
| POST             | `/organisations/:organisationId/activity-records/:id/{approve,reject}`                                                                         | `activity:approve`                     |
| POST             | `/organisations/:organisationId/activity-records/:id/{return,release-claim}`, `/bulk`                                                          | decided per record (§7.1)              |
| POST             | `/organisations/:organisationId/activity-records/:id/revise`                                                                                   | `activity:write`                       |
| GET, POST        | `/organisations/:organisationId/flare-sources/:id/{gas-compositions,flare-efficiencies}`                                                       | `activity:read` / `activity:write`     |
| POST             | `/organisations/:organisationId/{gas-compositions,flare-efficiencies}/:id/withdraw`                                                            | `activity:write`                       |
| GET, POST        | `/organisations/:organisationId/activity-records/:id/calculations`                                                                             | `calculation:read` / `calculation:run` |
| GET              | `/organisations/:organisationId/calculations[/:id[/history]]` (`status`, `claimedBy=me`, `sort=submitted`)                                     | `calculation:read`                     |
| POST             | `/organisations/:organisationId/calculations/:id/{submit,recall,discard,start-review,release-claim,forward,approve,reject}`                    | decided per calculation (§8.1)         |
| GET              | `/methodology/editions[/:id]`                                                                                                                  | public                                 |
| GET, POST, PATCH | `/admin/methodology/editions[/:id[/draft,/approve,/withdraw,/parameters/:key]]`                                                                | Platform Administrator                 |

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

Gas analyses and flare efficiency records use `activity:read` and `activity:write`. The methodology registry is platform-level: approved editions are public, and only Platform Administrators (`users.isPlatformAdmin`) draft, edit, approve and withdraw editions; that grants no access to any organisation's data.

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

## 8. Calculation integrity

**Implemented** (Milestone 3, §8.1). Each calculation result stores: emission-factor identifiers and versions, factor sources, methodology and version, GWP values and source, original and standardised inputs, assumptions, formula, calculation timestamp and calculation version.

- Recalculation creates a new version; historical results are never overwritten.
- Calculations are blocked when inputs required by the methodology are missing.
- No hardcoded factors. The illustrative "1 MMscf ≈ 55 tCO2e" figure must not be used as an approved factor.

### 8.1 Emissions calculations and the methodology registry (Milestone 3)

Decisions confirmed with the product owner on 2026-11-16, built on the reference in `.claude/skills/flare-calculator-helper/SKILL.md`. The values were checked against the source documents before use: IPCC 2006 Vol. 2 Ch. 4 (current corrected PDF), API Compendium (2009) §4.6, and the GHG Protocol's tabulation of AR5 GWPs.

- **Methodology editions.** Every rule and number lives in a numbered edition of the methodology `flame-flaring-venting` (`methodology_editions`, `methodology_parameters`), not in code. An edition holds the overview, each route's formulas, every decision with its reason and references, the limitations, and every number with its source organisation, document, edition, page/table/equation, URL and the date it was checked. Edition 1 is loaded by the migration as a **draft**; nothing can be calculated until a Platform Administrator approves an edition.
- **Who maintains it.** Platform Administrators. One prepares a draft (from an approved or superseded edition); a different one approves it. Anyone who created or edited a draft (read from the audit log) can't approve it; a CHECK constraint also stops the creator approving. Approving supersedes the previous edition, which stays published. Approved, superseded and withdrawn editions never change (trigger, even for the schema owner); only drafts are edited or withdrawn. One draft per methodology at a time.
- **Public.** Approved and superseded editions are readable without signing in at `/methodology` (API `GET /methodology/editions[/:id]`), so users, auditors and regulators can see how every figure is produced. Each decision and number has an anchor; a calculation's trace links to the exact number in the edition it used.
- **Edition 1 numbers.** 42.3 × 10⁻³ kmol/m³ (IPCC p. 4.45; the exact ideal-gas value is not used, so results match IPCC's own arithmetic); molecular weights CH₄ 16.043, CO₂ 44.011; carbon numbers 1–5 (C₆+ from the analysis, no default); API defaults 98% carbon conversion, 2% uncombusted CH₄ for production and 0.5% for refinery flares; IPCC reference-case factors CO₂ 2.0, CH₄ 0.012, N₂O 0.000023 Gg per 10⁶ m³ flared (Tables 4.2.4/4.2.5 footnote e; the N₂O value was checked in four places and confirmed by the product owner); AR5 100-year GWPs CO₂ 1, CH₄ 28, N₂O 265 (the AR5 fossil-methane value 30 is not used); exact unit conversions.
- **Routes.** _Composition flaring_ (primary): CO₂ from the hydrocarbon carbon converted at the efficiency plus the CO₂ already in the gas (API Eq. 4-15), unburned CH₄ (API Eq. 4-16), N₂O from the IPCC factor per volume flared. _IPCC reference-case flaring_: the three factors per volume flared, only with a recorded reason, labelled Estimated. _Composition venting_: all CH₄ and CO₂ in the gas, no combustion, no N₂O; gas through an unlit flare is recorded as venting. Production-based IPCC Tier 2 and "other gas release" are not offered.
- **Inputs.** _Gas analyses_ per flare source: sample date, report reference, the date from which they apply, mole % of 12 components, C₆+ carbon number required when C₆+ > 0; the total must be 100% ± 0.5% as entered and is never rescaled. _Flare efficiency_ per flare source: measured test (with test date) or vendor specification (carbon-to-CO₂ % and uncombusted-CH₄ %), or a design requirement such as NUPRC's 98% DRE, which is recorded but never used as performance. Flare sources are marked **production** or **refinery**, which decides the default. Inputs are never edited; a correction is a new record and a mistaken one is withdrawn with a reason. A calculation uses the latest active record valid on or before the period start, and refuses when a different record starts inside the period.
- **Running a calculation.** One calculation per **approved** activity record (`POST /activity-records/:id/calculations`, `calculation:run`), using the approved edition. Volume: the record's standardised total volume, else its derived volume; a rate without operating hours can't be calculated. The person running it chooses the route and, for composition flaring, the flare's recorded efficiency or the methodology default. Missing inputs return 409 `CALCULATION_BLOCKED` with a list of what is needed; nothing is assumed. Arithmetic: 40 significant digits; results stored to 20 decimal places.
- **What a calculation keeps** (immutable; trigger): the edition, route, inputs snapshot (activity values, analysis, efficiency, and every edition parameter used with its source), the step-by-step trace (formula, substituted values, each value's origin or parameter key, result), engine version, CO₂, CH₄, N₂O (null for venting) in tonnes and tCO₂e, the data-quality label and its reasons.
- **Data quality.** _Measured basis_ only when the activity was measured, the composition measured and (for flaring) the efficiency tested or vendor-specified; otherwise _Estimated_, with the reasons listed. The label always appears next to the figure. tCO₂e is labelled as emissions, never as carbon credits.
- **Versions and review.** One open calculation per record (partial unique index). States: Calculated → Submitted → Under Review (claimed) → Awaiting Approval → Approved; Rejected (final, reason) and Discarded (before submission, reason). A correction is a new version; approving a version supersedes the previously approved one. Three-person rule: whoever ran or submitted it can't review or approve it, and its reviewer can't approve it (403 `SEPARATION_OF_DUTIES`). A calculation of an activity record that has since been revised is flagged and can't be approved. Every step is in `calculation_events` (append-only) and the audit log.
- **Interface.** Flare source page: gas analyses and flare efficiency. Approved activity record: its calculation versions and _Calculate emissions_. Calculation page: result, quality reasons, inputs, the step-by-step trace with links into the methodology edition, actions and history. Review page: calculation queues. `/methodology` (public) and `/admin/methodology` (Platform Administrators).
- **Out of scope.** Reports and period totals, NUPRC templates, uncertainty, evidence uploads, the production-based route, other gas releases.

## 9. Audit logging

**Implemented.** Append-only `AuditLog` table. It is protected in two layers: the API connects as a restricted role with only INSERT and SELECT on it, and triggers reject row UPDATE, DELETE and TRUNCATE even for the schema owner (who alone could disable them). Each entry records actor, organisation, action, entity type and id, timestamp, and change summary. Covers creation, submission, review, corrections, approval, rejection, factor changes, calculations and permission changes.

## 10. Evidence

Files live in object storage; PostgreSQL holds metadata and relationships. Uploads are type- and size-checked, access is authorised per request and served through short-lived signed URLs. Evidence linked to approved records is not deleted.

## 11. Security baseline

- Server-side sessions stored in PostgreSQL, HTTP-only `Secure` `SameSite` cookies, expiry and revocation.
- Password hashing with argon2id (`argon2`). Unknown-email logins burn equivalent hashing time, and all failures return the same message.
- CSRF protection, security headers (helmet), and rate limiting on failed sign-ins at three levels: per client IP; per account from one IP (strict, default 5); and per account from all IPs combined (ceiling, default 20). An attacker who knows an email can only lock their own address out of that account; reaching the account-wide ceiling requires failures from many addresses. Successful sign-ins never count. The first blocked attempt of each window is audited as `auth.login_rate_limited` (no actor; the targeted account as entity), so lockouts and attacks are visible without one audit row per blocked request. The limiter store is in memory, so limits are per API instance.
- Structured JSON logging (no `console.log`); never log passwords, tokens or sensitive personal data.
- Secrets only in environment variables; `.env` files are git-ignored.
- Least-privilege database access. Migrations run as the schema owner (`MIGRATION_DATABASE_URL`). The API connects as a login in the `flame_app` role (`DATABASE_URL`), created with `npm run db:create-app-user -w @flame/api`. That command only creates a new login or reuses a plain one: it refuses an existing role that is a superuser, can create roles or databases, has replication or RLS-bypass rights, or owns any object. It sends the password inside `CREATE/ALTER ROLE`, so avoid running it while PostgreSQL logs DDL statements (`log_statement = ddl` or `all`). That role has CRUD on application tables, INSERT and SELECT only on `audit_logs`, no access to `_prisma_migrations`, and cannot alter tables, drop or disable triggers, or create tables. New tables get the same CRUD grants through default privileges. Any append-only table (e.g. calculation versions, approvals) must `REVOKE UPDATE, DELETE` in its migration, and every table must be listed with its approved privileges in `audit-hardening.test.ts`: the test fails for any table whose app privileges differ from that list, including a newly added one. The API checks its role at startup: in production it refuses to start if it can modify or owns `audit_logs`; in development it logs a warning. On hosted PostgreSQL without `CREATEROLE`, create the `flame_app` role before the first migration.
- PostgreSQL Row-Level Security: **deferred** (decision 2026-11-15). Backend scoping plus composite foreign keys for now; RLS to be added as defence in depth once core modules settle. It does not replace backend authorisation.

## 12. Environments and tooling

| Concern         | Choice                                                                                                                                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager | npm workspaces                                                                                                                                                                                                                                                             |
| Node            | 24.x                                                                                                                                                                                                                                                                       |
| Database        | PostgreSQL 15 or later (local: PostgreSQL 18 in Docker, `docker-compose.yml`). 15+ is required because the app role relies on `PUBLIC` having no `CREATE` on the `public` schema by default                                                                                |
| Migrations      | `prisma migrate dev` locally; `prisma migrate deploy` in CI/production. Prisma does not run migrations in a transaction, so every `migration.sql` is wrapped in `BEGIN; … COMMIT;` by hand: it applies completely or not at all, and constraints are never briefly missing |
| Tests           | Vitest + Supertest against a real PostgreSQL test database (`*_test`, created and migrated automatically)                                                                                                                                                                  |
| Lint / format   | ESLint (typescript-eslint strict, type-checked) and Prettier                                                                                                                                                                                                               |
| Hosting         | Render or equivalent                                                                                                                                                                                                                                                       |

### 12.1 Production deployment checklist

- Run migrations as the schema owner (`MIGRATION_DATABASE_URL`), then `npm run db:create-app-user -w @flame/api`, and point `DATABASE_URL` at that restricted login. The API refuses to start in production otherwise.
- If the migration user cannot `CREATEROLE` (common on hosted PostgreSQL), a database administrator must, before the first migration:
  1. `CREATE ROLE flame_app NOLOGIN;`
  2. `CREATE ROLE <app_login> LOGIN PASSWORD '<secret>' IN ROLE flame_app;` (the login used in `DATABASE_URL`; `db:create-app-user` cannot do this without `CREATEROLE`)
  3. Either `GRANT flame_app TO <migration_user> WITH ADMIN OPTION;` or grant membership themselves, because on PostgreSQL 16+ adding members requires `ADMIN OPTION` on the role.
     The migration then finds `flame_app` already present and only applies its grants.
- `db:create-app-user` runs with `tsx`, a development dependency. If the production host installs with `--omit=dev`, run it from an operator machine with `MIGRATION_DATABASE_URL` and `DATABASE_URL` set for the production database.
- Run tests only against a dedicated or throwaway PostgreSQL server: the test setup creates a `flame_app_test` login (fresh random password each run) that is a member of the cluster-wide `flame_app` role.
- Set `TRUST_PROXY` to the number of reverse-proxy hops (1 on Render). The API logs a warning if it sees `X-Forwarded-For` while this is 0.
- Before running more than one API instance, move the sign-in rate-limit store to a shared store (e.g. PostgreSQL or Redis).
- Set `NODE_ENV=production` so cookies are `Secure` and use the `__Host-` prefix, and set `WEB_ORIGIN` to the deployed web app's origin.

## 13. Open decisions

- Review and approval permissions resolved 2026-11-16 (§6, §7.1); activity-data permissions 2026-11-15 (§6, §4.1).
- User invitation and membership management flow.
- OpenAPI documentation generation for the implemented endpoints.
- When to add PostgreSQL RLS.
- Methodology and emission-factor sources resolved 2026-11-16 (§8.1, edition 1); later changes are new editions.
- Object-storage provider confirmation.
