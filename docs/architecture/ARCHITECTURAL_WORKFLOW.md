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

## 5. Request pipeline (backend)

**Implemented** (Milestone 1). Every organisation-scoped endpoint runs, in order:

1. Request logging and security headers.
2. Session authentication: cookie token → SHA-256 lookup in `sessions` → `req.auth` (idle and absolute expiry, revocation, disabled users rejected).
3. CSRF for state-changing methods: a foreign `Origin` header is rejected, and authenticated requests must send the session's token in `X-CSRF-Token` (login is Origin-checked only, since it issues the token).
4. Organisation context: the client names the organisation (route parameter); the backend loads the user's **membership** for it and rejects otherwise. The membership, not the client value, becomes `req.organisation`.
5. Permission check for the specific operation.
6. Request validation (Zod) on params, query and body.
7. Handler → service → repository, with every query filtered by the authorised `organisationId` and ownership chains verified (e.g. a flare source must belong to a facility in the same organisation).
8. Consistent response or error shape; no stack traces or database details to clients. Cross-tenant lookups return 404, not 403, to avoid leaking existence.

URL shape: `/api/v1/organisations/:organisationId/<resource>`. Organisation-owned child tables also carry a composite foreign key `(organisationId, parentId) → parent(organisationId, id)`, so the database rejects a child whose parent belongs to another organisation even if application code were wrong. All foreign keys are `ON DELETE RESTRICT ON UPDATE RESTRICT`: ids are immutable, so changing a record's organisation (or any referenced id) fails instead of silently carrying its children or history with it.

Implemented endpoints (all under `/api/v1`):

| Method | Path                                                                                                     | Permission           |
| ------ | -------------------------------------------------------------------------------------------------------- | -------------------- |
| POST   | `/auth/login`                                                                                            | public, rate-limited |
| GET    | `/auth/session`                                                                                          | signed in            |
| POST   | `/auth/logout`, `/auth/logout-all`                                                                       | signed in            |
| GET    | `/organisations/:organisationId`                                                                         | `organisation:read`  |
| GET    | `/organisations/:organisationId/{facilities,assets,flare-sources}` (paged, `q`, `status`, parent filter) | `hierarchy:read`     |
| GET    | `/organisations/:organisationId/{facilities,assets,flare-sources}/:id`                                   | `hierarchy:read`     |
| POST   | `/organisations/:organisationId/{facilities,assets,flare-sources}`                                       | `hierarchy:write`    |
| PATCH  | `/organisations/:organisationId/{facilities,assets,flare-sources}/:id`                                   | `hierarchy:write`    |
| POST   | `/organisations/:organisationId/{facilities,assets,flare-sources}/:id/archive`                           | `hierarchy:write`    |

Records are archived, never deleted. Archived records are read-only, cannot receive new children, and a parent cannot be archived while it has active children. A child cannot be moved to another parent.

## 6. Roles

Data Entry Officer, Reviewer, Approver, Administrator, Organisation Owner, Viewer (per organisation, users may hold several) and Platform Administrator (platform-level, no implicit tenant data access). Initial permission matrix (`apps/api/src/modules/organisations/permissions.ts`), extended per module:

| Permission          | Owner | Administrator | Approver | Reviewer | Data Entry | Viewer |
| ------------------- | ----- | ------------- | -------- | -------- | ---------- | ------ |
| `organisation:read` | ✓     | ✓             | ✓        | ✓        | ✓          | ✓      |
| `hierarchy:read`    | ✓     | ✓             | ✓        | ✓        | ✓          | ✓      |
| `hierarchy:write`   | ✓     | ✓             |          |          |            |        |

## 7. Review and approval workflow

```
Draft → Submitted → Under Review → Needs Correction ─┐
                         │                           │ (resubmit)
                         └→ Awaiting Approval → Approved
                                         └→ Rejected
```

- Transitions are validated in the backend `workflow` service, with role checks per transition.
- A user cannot approve their own submission.
- Approved records are immutable; changes create a new version linked to the original.
- Comments, correction reasons, actors and timestamps are retained.
- Only approved records feed official reports.

## 8. Calculation integrity

Each calculation result stores: emission-factor identifiers and versions, factor sources, methodology and version, GWP values and source, original and standardised inputs, assumptions, formula, calculation timestamp and calculation version.

- Recalculation creates a new version; historical results are never overwritten.
- Calculations are blocked when inputs required by the methodology are missing.
- No hardcoded factors. The illustrative "1 MMscf ≈ 55 tCO2e" figure must not be used as an approved factor.

## 9. Audit logging

**Implemented.** Append-only `AuditLog` table. It is protected in two layers: the API connects as a restricted role with only INSERT and SELECT on it, and triggers reject row UPDATE, DELETE and TRUNCATE even for the schema owner (who alone could disable them). Each entry records actor, organisation, action, entity type and id, timestamp, and change summary. Covers creation, submission, review, corrections, approval, rejection, factor changes, calculations and permission changes.

## 10. Evidence

Files live in object storage; PostgreSQL holds metadata and relationships. Uploads are type- and size-checked, access is authorised per request and served through short-lived signed URLs. Evidence linked to approved records is not deleted.

## 11. Security baseline

- Server-side sessions stored in PostgreSQL, HTTP-only `Secure` `SameSite` cookies, expiry and revocation.
- Password hashing with argon2id (`argon2`). Unknown-email logins burn equivalent hashing time, and all failures return the same message.
- CSRF protection, security headers (helmet), and rate limiting on failed sign-ins, both per client IP and per account (normalised email, from any IP). The account limit means repeated wrong passwords can temporarily lock that account's sign-in for the window; successful sign-ins never count. The limiter store is in memory, so limits are per API instance.
- Structured JSON logging (no `console.log`); never log passwords, tokens or sensitive personal data.
- Secrets only in environment variables; `.env` files are git-ignored.
- Least-privilege database access. Migrations run as the schema owner (`MIGRATION_DATABASE_URL`). The API connects as a login in the `carbon_app` role (`DATABASE_URL`), created with `npm run db:create-app-user -w @carbon/api`. That role has CRUD on application tables, INSERT and SELECT only on `audit_logs`, no access to `_prisma_migrations`, and cannot alter tables, drop or disable triggers, or create tables. New tables get the same CRUD grants through default privileges; any new append-only table must `REVOKE` explicitly in its migration. The API checks its role at startup: in production it refuses to start if it can modify or owns `audit_logs`; in development it logs a warning. On hosted PostgreSQL without `CREATEROLE`, create the `carbon_app` role before the first migration.
- PostgreSQL Row-Level Security: **deferred** (decision 2026-11-15). Backend scoping plus composite foreign keys for now; RLS to be added as defence in depth once core modules settle. It does not replace backend authorisation.

## 12. Environments and tooling

| Concern         | Choice                                                                                                                                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager | npm workspaces                                                                                                                                                                                                                                                             |
| Node            | 24.x                                                                                                                                                                                                                                                                       |
| Local database  | PostgreSQL in Docker (`docker-compose.yml`)                                                                                                                                                                                                                                |
| Migrations      | `prisma migrate dev` locally; `prisma migrate deploy` in CI/production. Prisma does not run migrations in a transaction, so every `migration.sql` is wrapped in `BEGIN; … COMMIT;` by hand: it applies completely or not at all, and constraints are never briefly missing |
| Tests           | Vitest + Supertest against a real PostgreSQL test database (`*_test`, created and migrated automatically)                                                                                                                                                                  |
| Lint / format   | ESLint (typescript-eslint strict, type-checked) and Prettier                                                                                                                                                                                                               |
| Hosting         | Render or equivalent                                                                                                                                                                                                                                                       |

### 12.1 Production deployment checklist

- Run migrations as the schema owner (`MIGRATION_DATABASE_URL`), then `npm run db:create-app-user -w @carbon/api`, and point `DATABASE_URL` at that restricted login. The API refuses to start in production otherwise.
- If the database user cannot `CREATEROLE`, create the `carbon_app` role before the first migration.
- Set `TRUST_PROXY` to the number of reverse-proxy hops (1 on Render). The API logs a warning if it sees `X-Forwarded-For` while this is 0.
- Before running more than one API instance, move the sign-in rate-limit store to a shared store (e.g. PostgreSQL or Redis).
- Set `NODE_ENV=production` so cookies are `Secure` and use the `__Host-` prefix, and set `WEB_ORIGIN` to the deployed web app's origin.

## 13. Open decisions

- Permissions for activity data, review and approval (extend the matrix in §6).
- User invitation and membership management flow.
- OpenAPI documentation generation for the implemented endpoints.
- When to add PostgreSQL RLS.
- Initial methodology and emission-factor sources for gas flaring (must come from documented, sourced references).
- Object-storage provider confirmation.
