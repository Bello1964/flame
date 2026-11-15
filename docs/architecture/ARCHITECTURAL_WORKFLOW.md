# Architectural Workflow

> **Status:** Draft v0.1 (2026-11-15). This document describes the *target* architecture. It is guidance, not evidence that any feature exists. Sections marked **Implemented** reflect code in the repository; everything else is **Planned**.

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

npm workspaces monorepo. **Implemented** (scaffold only).

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
  <name>.routes.ts        Endpoint registration and middleware
  <name>.controller.ts    HTTP in/out only
  <name>.service.ts       Business rules and workflows
  <name>.repository.ts    Tenant-scoped data access
  <name>.schemas.ts       Request validation (Zod)
  <name>.test.ts          Unit / API tests
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

| Module | Responsibility |
|---|---|
| `auth` | Sign-in, sign-out, server-side sessions, password hashing, session revocation, CSRF |
| `organisations` | Organisations, memberships, roles, invitations |
| `facilities` | Facility → Asset → Flare Source hierarchy |
| `activity-data` | Gas activity records (flared, vented, other releases), measured vs estimated, original and standardised units |
| `validation` | Data-quality checks, missing-input detection, evidence gaps |
| `emission-factors` | Versioned emission factors, methodologies, GWP sets, sources |
| `calculations` | Versioned emissions calculations producing tCO2e with full traceability |
| `workflow` | Review and approval state machine, comments, correction history |
| `evidence` | File metadata, upload validation, signed access to object storage |
| `reporting` | Approved-only official reports; clearly labelled preliminary views |
| `mitigation` | Emissions-reduction initiatives and tracking |
| `audit` | Append-only audit log |
| `platform-admin` | Platform-level operations, strictly separated from tenant data |

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

Every organisation-scoped endpoint runs, in order:

1. Request logging and security headers.
2. Session authentication → `req.user`.
3. CSRF check for state-changing methods.
4. Organisation context: the client names the organisation (route parameter); the backend loads the user's **membership** for it and rejects otherwise. The membership, not the client value, becomes `req.organisation`.
5. Permission check for the specific operation.
6. Request validation (Zod) on params, query and body.
7. Controller → service → repository, with every query filtered by the authorised `organisationId` and ownership chains verified (e.g. a flare source must belong to a facility in the same organisation).
8. Consistent response or error shape; no stack traces or database details to clients. Cross-tenant lookups return 404, not 403, to avoid leaking existence.

Proposed URL shape: `/api/v1/organisations/:organisationId/<resource>`.

## 6. Roles

Data Entry Officer, Reviewer, Approver, Administrator, Organisation Owner, Viewer (per organisation, users may hold several) and Platform Administrator (platform-level, no implicit tenant data access). The exact permission matrix is to be defined with the `organisations` module.

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

Append-only `AuditLog` table: actor, organisation, action, entity type and id, timestamp, and change summary. Covers creation, submission, review, corrections, approval, rejection, factor changes, calculations and permission changes.

## 10. Evidence

Files live in object storage; PostgreSQL holds metadata and relationships. Uploads are type- and size-checked, access is authorised per request and served through short-lived signed URLs. Evidence linked to approved records is not deleted.

## 11. Security baseline

- Server-side sessions stored in PostgreSQL, HTTP-only `Secure` `SameSite` cookies, expiry and revocation.
- Password hashing with a modern algorithm (argon2id or bcrypt — to be decided).
- CSRF protection, rate limiting on auth endpoints, security headers.
- Structured JSON logging (no `console.log`); never log passwords, tokens or sensitive personal data.
- Secrets only in environment variables; `.env` files are git-ignored.
- PostgreSQL Row-Level Security may be added as defence in depth; it does not replace backend authorisation.

## 12. Environments and tooling

| Concern | Choice |
|---|---|
| Package manager | npm workspaces |
| Node | 24.x |
| Local database | PostgreSQL in Docker (`docker-compose.yml`) |
| Migrations | `prisma migrate dev` locally; `prisma migrate deploy` in CI/production |
| Tests | Vitest (unit), Vitest + Supertest (API) |
| Hosting | Render or equivalent |

## 13. Open decisions

- Permission matrix per role.
- Password-hashing library and session store implementation.
- Whether to adopt PostgreSQL RLS in the first release.
- Initial methodology and emission-factor sources for gas flaring (must come from documented, sourced references).
- Object-storage provider confirmation.
