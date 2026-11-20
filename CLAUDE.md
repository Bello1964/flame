# Project Overview

- **Product:** **Flame**, a multi-tenant enterprise carbon accounting and carbon-credit commerce system. Internal identifiers use the same name: packages `@flame/*`, databases `flame` / `flame_test`, app role `flame_app`, cookie `flame_sid`.
- **Initial market:** Nigeria and West Africa, targeting oil and gas organisations.
- **Initial product:** An enterprise carbon-management platform focused on gas-flaring activity data and emissions accounting.
- **Purpose:** Manage operational activity data, calculate greenhouse gas emissions, maintain supporting evidence, generate reports, and manage emissions-reduction activities.
- **Core workflow:** Organisation → Facility → Asset → Flare Source → Gas Activity Data → Validation → Emissions Calculation → tCO2e → Review and Approval → Reporting → Mitigation.
- **Future module:** A separate carbon-credit marketplace for eligible participants to buy and sell credits issued by recognised external programmes. Marketplace transactions, blockchain, and subscription billing are outside the initial implementation scope.
- **Initial data collection:** Manual entry, with architecture designed for future operational-system, meter, sensor, and other data integrations.
- **Architecture:** Modular monolith with a shared PostgreSQL database and strict organisation-level tenant isolation.
- **Business integrity:** Never confuse gas flared, gas vented, emissions, tCO2e, carbon-credit eligibility, and formally issued carbon credits. Calculating tCO2e does not automatically generate or issue carbon credits.
- Treat this document and `docs/architecture/ARCHITECTURAL_WORKFLOW.md` as architectural guidance, not proof that planned functionality has already been implemented.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript |
| Styling and UI | Tailwind CSS, shadcn/ui |
| Routing | React Router |
| Server state | TanStack Query |
| Forms and validation | React Hook Form, Zod |
| Backend | Node.js, Express, TypeScript |
| API | REST, OpenAPI/Swagger |
| Database and ORM | PostgreSQL, Prisma |
| Authentication | Server-side sessions, HTTP-only cookies |
| Testing | Vitest, Supertest |
| File storage | Cloudflare R2 or equivalent |
| Hosting | Render or equivalent |
| Version control | Git, GitHub |

These are confirmed architectural decisions, not proof that every dependency is installed. Never introduce Supabase, Next.js, MongoDB, Firebase, microservices, or replacement frameworks without explicit authorisation.

## Commands and Repository Discovery

- Before running commands, inspect root and workspace `package.json` files, lockfiles, and package-manager configuration.
- Identify the actual package manager and inspect available scripts.
- Inspect TypeScript, lint, test, build, and Prisma configuration before relying on them.
- Use existing scripts for development, build, testing, linting, and type checking.
- Use the repository's configured Prisma migration workflow for database changes.
- Run the narrowest relevant tests first, followed by applicable project-wide checks.
- Never invent scripts, assume commands are configured, or claim a check passed unless it was actually executed successfully.
- Report commands executed and their actual results.

## Project Structure and Architecture

- Follow the existing repository structure. Inspect the actual directory tree before creating or referencing paths.
- Do not reorganise working code without a clear reason and approval where the change is substantial.
- Keep frontend and backend responsibilities separate.
- **Frontend:** Pages, layouts, reusable components, UI primitives, hooks, API clients, forms, and frontend validation.
- **Backend:** Routes, controllers, middleware, services, repositories/data access, validation, and API documentation.
- **Database:** Prisma schema, migrations, seed scripts, and database utilities.
- **Shared:** Reusable types, constants, and utilities only where the existing architecture supports sharing.
- **Tests:** Organise unit, integration, and API tests consistently with the repository.
- Keep business logic in backend services, not React components.
- Preserve module boundaries. Do not introduce microservices or unnecessary abstractions.

## Coding Rules

- MUST use strict TypeScript and follow established naming conventions and patterns.
- MUST NOT use `any`; prefer explicit types, generics, or `unknown` with proper narrowing.
- MUST validate untrusted inputs on the backend, even when frontend validation exists.
- MUST keep authoritative emissions and carbon-credit calculations on the backend.
- MUST use TanStack Query for server-state management and React Hook Form with Zod for forms where appropriate.
- MUST use reusable React components and existing shadcn/ui patterns where appropriate.
- MUST use ₦ for Naira-denominated amounts, MMscf/d for average gas-flow rates, MMscf for total gas volume, and tCO2e for emissions.
- MUST preserve original measurements, units, reporting periods, and reference conditions alongside standardised values.
- MUST use appropriate decimal precision for accounting calculations. Avoid floating-point database storage for measurements or accounting quantities that require exact decimal representation.
- MUST keep emission factors, methodologies, GWP values, and calculation assumptions traceable and versioned.
- MUST provide meaningful loading, empty, success, and error states.
- MUST maintain responsive layouts and accessibility.
- MUST NOT silently overwrite submitted records, approved records, original measurements, or historical calculations.

## Database, Tenancy, and Access Control

- MUST use PostgreSQL and Prisma unless an architectural change is explicitly approved.
- MUST track every schema change through Prisma migrations. Never make untracked schema changes.
- MUST preserve relationships, constraints, indexes, and referential integrity.
- MUST associate organisation-owned records with the correct organisation and enforce tenant isolation on every relevant backend operation.
- MUST derive organisation access from the authenticated user's authorised membership. Never trust a frontend-supplied organisation ID as proof of access.
- MUST enforce role-based permissions on the backend. Frontend visibility is not authorisation.
- MUST apply PostgreSQL access controls and consider Row-Level Security as an additional defence where appropriate; RLS does not replace backend authorisation.
- MUST NOT execute ad-hoc raw SQL or make production database changes without authorisation.
- MUST NOT bypass authorisation or tenant isolation to make a query or feature work.
- MUST NOT expose database credentials, session secrets, or privileged credentials to the frontend.

## Business Logic and Calculation Integrity

- MUST distinguish routine, non-routine, and emergency flaring, venting, and other gas releases.
- MUST NOT treat flaring and venting as interchangeable or apply flaring factors to venting without an appropriate methodology.
- MUST NOT treat the illustrative `1 MMscf flared ≈ 55 tCO2e` estimate as a universal or approved emission factor.
- MUST use documented methodologies, approved and applicable emission-factor versions, and sourced GWP values for approved calculations.
- MUST preserve the exact factor identifiers and versions, source references, methodology and version, GWP values and source, original and standardised inputs, assumptions, formulas, calculation timestamp, and calculation version for every result.
- MUST create a new calculation version when recalculating. Never silently alter historical approved calculations or factor versions.
- MUST prevent calculations when technical inputs required by the selected methodology are missing.
- MUST preserve measured and estimated values as distinct data types; estimated measurements require an explanation.
- MUST flag missing evidence and data-quality limitations rather than conceal them.
- MUST ensure only approved activity records contribute to officially approved emissions reports. Preliminary dashboards may show pending data only when its status is clear.
- MUST prevent a user from approving their own submission.
- MUST NOT claim regulatory compliance, independent verification, carbon-credit eligibility, or credit issuance without the applicable requirements and evidence.
- MUST NOT fabricate operational data, emission factors, gas composition, combustion efficiency, or regulatory requirements.

## Security and Data Protection

- MUST use server-side sessions and HTTP-only cookies with appropriate Secure, SameSite, expiration, and CSRF protections.
- MUST implement session revocation and secure password hashing.
- MUST enforce authentication, authorisation, tenant isolation, and least-privilege access.
- MUST validate uploads, restrict file access, and store supporting files in cloud object storage rather than directly in PostgreSQL.
- MUST keep secrets and credentials out of source control and client bundles.
- MUST NOT disable security controls to fix application errors.
- MUST NOT use `console.log` as production logging; follow the project's structured logging approach.
- MUST protect confidential organisation data from other tenants and restrict platform-administrator access to authorised platform-level operations.

## Development Workflow

1. Inspect relevant files, dependencies, configuration, and existing behaviour before modifying anything.
2. Confirm the requirement, identify affected modules, and understand dependencies.
3. Follow the modular monolith architecture and preserve established module boundaries.
4. Reuse existing components, services, utilities, and patterns.
5. Ask before installing packages, changing frameworks or database architecture, or making major architectural decisions.
6. Implement the smallest maintainable change that satisfies the requirement.
7. Add or update tests, especially for tenant isolation, permissions, workflow transitions, and emissions calculations.
8. Run relevant configured tests, type checking, linting, and builds; report actual results.
9. Review for regressions, security issues, data integrity, and calculation traceability.
10. Report changed files, important decisions, verification performed, and remaining limitations.
11. Update relevant documentation when architecture or behaviour changes.

Delegate bounded frontend, backend, or independent review tasks to the corresponding specialised agent when useful. The primary session remains responsible for integration and final verification.

## Claude Code Resources

Load a specialised resource when its subject is relevant. Do not assume a referenced resource exists until it has been created.

- `.claude/skills/flare-calculator/SKILL.md` — Gas-flaring units, conversions, emissions calculations, factors, methodologies, and calculation integrity.
- `.claude/skills/ui-design/SKILL.md` — FLAME art direction and design system (Basalt, Limestone, Oxide, Patina, Flare Amber; Instrument Serif, IBM Plex), marketing site, React dashboards, Tailwind CSS, shadcn/ui, accessibility, and data visualisation.
- `.claude/agents/backend.md` — Backend, database, tenancy, security, API, and calculation implementation.
- `.claude/agents/frontend.md` — Frontend pages, components, forms, state management, and dashboards.
- `.claude/agents/reviewer.md` — Independent code, architecture, security, and data-integrity reviews.
- Use project slash commands for repeatable commit, review, and bug-fixing workflows.

## What NOT to Do

- Do not install packages or introduce frameworks without approval.
- Do not hardcode secrets or credentials.
- Do not weaken authentication, authorisation, tenant isolation, or database protections.
- Do not fabricate data, emission factors, calculations, regulatory requirements, or test results.
- Do not duplicate existing utilities or components without a reason.
- Do not rewrite working functionality unnecessarily.
- Do not modify unrelated files when implementing a specific change.
- Do not claim tests, builds, migrations, or deployments succeeded unless they were actually run and succeeded.
