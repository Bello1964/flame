
---
description: Investigate, diagnose, and safely fix a reported bug in the Carbon Management Platform while preserving existing architecture, functionality, security, and data integrity.
---

# Fix Bug

Act as a senior full-stack software engineer responsible for diagnosing and fixing bugs in the Carbon Management Platform.

Investigate the actual cause before changing code. Implement the smallest reliable correction that resolves the reported problem without introducing regressions or violating established project requirements.

## Bug report

$ARGUMENTS

If the user provides no specific bug description, inspect the current conversation for the reported issue. If the problem remains unclear, ask the user for the missing information before making changes.

## 1. Understand the problem

Before editing anything:

1. Read the root `CLAUDE.md`.
2. Read relevant architectural documentation, particularly `docs/architecture/ARCHITECTURAL_WORKFLOW.md` if present.
3. Read applicable Claude Code skills, especially `flare-calculator` for calculation-related bugs and `ui-design` for interface-related bugs.
4. Inspect the repository structure.
5. Review the relevant implementation and surrounding code.
6. Inspect related tests, Zod schemas, API routes, middleware, controllers, services, repositories, Prisma models, and frontend components as applicable.
7. Check the current Git state using `git status` and relevant diffs.
8. Identify existing user changes that must be preserved.

Establish:

- Expected behaviour.
- Actual behaviour.
- Steps or conditions that trigger the bug.
- Relevant inputs and outputs.
- Affected users, organisations, records, and workflows.
- Whether the issue is isolated or crosses multiple modules.

Do not assume the user's description identifies the root cause.

If essential information is missing, ask one focused clarification question rather than guessing.

## 2. Reproduce and diagnose

Investigate the failure before implementing a fix.

Use available evidence, such as:

- Error messages and stack traces.
- Browser console output.
- Network requests and API responses.
- Server logs.
- Database constraints and query behaviour.
- Existing automated tests.
- Relevant application state and execution paths.
- Prisma query results and migration history where appropriate.

Trace the problem through the affected layers.

**For frontend issues**, inspect the component, hooks, state management, TanStack Query behaviour, React Hook Form validation, API service, and backend response as necessary.

**For backend issues**, inspect the Express route, middleware, Zod validation, controller, service, repository, Prisma query, and database interaction as necessary.

**For database issues**, inspect the Prisma schema, migrations, relations, constraints, indexes, transactions, and affected records.

**For calculation or data-integrity issues**, trace the original inputs through validation, unit conversion, methodology selection, emission-factor selection, calculation, persistence, approval, and reporting.

Do not make speculative changes simply to see whether the problem disappears.

If the bug cannot be reproduced, identify the strongest evidence available and distinguish confirmed causes from possible causes.

## 3. Identify the root cause

Before editing, establish:

- The specific defect.
- Why it occurs.
- The affected code path.
- The conditions under which it occurs.
- The smallest appropriate correction.
- The potential impact on existing behaviour and stored data.

Check whether the issue results from:

- Incorrect business logic.
- Invalid assumptions or missing validation.
- React rendering or state-management problems.
- Incorrect TanStack Query caching or invalidation.
- Form handling or Zod validation.
- Incorrect API integration.
- Authentication or authorisation failures.
- Tenant-scoping defects.
- Prisma schema, migration, or query behaviour.
- Decimal precision or database type mismatches.
- Incorrect unit conversion or emissions calculation logic.
- Emission-factor or methodology version selection.
- Race conditions or asynchronous behaviour.
- File upload, storage, or evidence access.
- Configuration or environment differences.
- Missing or inadequate error handling.

Do not treat symptoms as root causes.

## 4. Implement the fix

Once the root cause is sufficiently established:

1. Make the smallest appropriate code change.
2. Follow existing naming, folder, and architectural conventions.
3. Reuse existing project utilities, services, components, and abstractions where appropriate.
4. Preserve established API contracts unless the bug requires a justified change.
5. Preserve unrelated user modifications.
6. Avoid unnecessary dependencies, refactoring, or file creation.
7. Keep frontend and backend responsibilities correctly separated.
8. Add or update regression tests that verify the corrected behaviour where appropriate.

Follow the established stack:

- React, Vite, and TypeScript for the frontend.
- Tailwind CSS and shadcn/ui for the interface.
- React Router for navigation.
- TanStack Query for server state.
- React Hook Form and Zod for forms and validation.
- Node.js, Express, and TypeScript for the backend.
- PostgreSQL and Prisma for persistence.
- OpenAPI/Swagger for API documentation where applicable.
- Vitest and Supertest for testing where configured.

Do not introduce Supabase, Next.js, MongoDB, Firebase, microservices, or replacement frameworks.

Do not rewrite working modules to fix an isolated defect.

Do not silently change unrelated functionality.

### Database and migration changes

If the fix requires a schema or migration change:

- Explain why the change is necessary.
- Inspect the existing Prisma schema and migration history.
- Determine the impact on existing records.
- Preserve historical operational and calculation data.
- Use the established Prisma migration workflow.
- Avoid destructive migrations.
- Do not run production migrations or destructive database commands without explicit authorisation.
- Do not reset or reseed a database containing user data without explicit authorisation.

## 5. Apply security and multi-tenancy checks

For bugs involving protected resources or user actions, verify that:

- Authentication is enforced.
- Backend authorisation is correct.
- Organisation membership is validated.
- Organisation scope is derived and enforced by the backend.
- Client-supplied organisation IDs are not trusted as proof of access.
- Related resources cannot be accessed across organisations.
- Role restrictions are enforced server-side.
- Sensitive information is not exposed through errors or logs.
- Session and cookie protections remain intact.
- CSRF protection is respected where applicable.
- Evidence and uploaded files remain access-controlled.

The platform uses shared PostgreSQL storage with organisation-level tenant isolation.

Every organisation-owned operation must be appropriately scoped to the authenticated user's membership.

A frontend-only correction is insufficient when the underlying defect is a backend security issue.

Do not treat hidden buttons, protected routes, or frontend role checks as substitutes for backend authorisation.

## 6. Preserve carbon-management integrity

For bugs involving operational or emissions data, apply the relevant domain rules.

### Activity data

- Keep gas flaring and gas venting distinct.
- Preserve original measurements and units.
- Preserve the applicable reference conditions.
- Do not silently change reference conditions.
- Validate unit conversions and reporting periods.
- Do not assume 24-hour operation when deriving volume from a rate.
- Check rate, duration, and volume consistency.
- Preserve measurement methods.
- Require explanations for estimated measurements.
- Flag overlapping records appropriately.
- Preserve original activity data when standardising values.

Initial reference conditions of 60°F and 14.73 psia are configurable project defaults, not universal assumptions. Respect the applicable organisation configuration and recorded measurement conditions.

Do not silently convert gauge pressure to absolute pressure or ignore compressibility where the selected methodology requires those considerations.

### Emission factors and methodologies

- Use approved, applicable emission-factor versions for approved calculations.
- Preserve factor sources, units, methodologies, and versions.
- Do not overwrite historical emission-factor versions.
- Preserve GWP sources, versions, and time horizons.
- Do not invent missing technical inputs.
- Verify methodology applicability before calculation.
- Do not apply flaring and venting treatment interchangeably without methodological justification.
- Do not treat an illustrative emission factor as an approved factor.
- Do not hardcode generic emissions assumptions to make a calculation succeed.

### Calculation integrity

- Ensure calculations are dimensionally and mathematically correct.
- Preserve calculation inputs, assumptions, and outputs.
- Preserve original and standardised activity values.
- Record the exact factor and methodology versions used.
- Preserve calculation timestamps and version information.
- Preserve per-gas results and total tCO2e.
- Avoid premature rounding.
- Use appropriate decimal precision for accounting quantities.
- Do not apply GWP twice when a factor is already expressed in tCO2e.
- Do not overwrite historical calculation results.
- Create a new traceable version when recalculation is required.
- Ensure historical approved calculations remain reproducible.

If required methodology inputs are missing, do not fabricate them or silently substitute assumptions. Block the affected calculation where necessary and report the missing requirements.

### Review and approval

- Enforce valid workflow transitions.
- Prevent submitters from approving their own submissions.
- Preserve reviewer comments and correction requests.
- Preserve review and approval history.
- Ensure only approved records contribute to official approved reports.
- Clearly distinguish preliminary, submitted, pending, and approved records.

### Carbon-credit boundaries

- Do not equate tCO2e with issued carbon credits.
- Do not imply that the platform independently verifies or certifies credits.
- Do not imply that emissions calculations automatically create eligible or issued credits.
- Keep future marketplace operations separate from the initial emissions-management workflow.

## 7. Verify the fix

After implementation:

1. Inspect the final diff.
2. Run relevant tests.
3. Add or update regression tests where appropriate.
4. Run relevant lint, type-check, or build scripts when available.
5. Verify the original failure condition.
6. Check nearby functionality that could have been affected.
7. Confirm that no unrelated files or user changes were accidentally modified.

Inspect the actual `package.json` files and available scripts before selecting commands.

Do not invent commands or assume a particular test framework is installed.

**For frontend bugs**, verify the affected interaction, API integration, loading state, error state, success state, and responsive behaviour where practical.

**For API bugs**, verify the request, response, validation, authentication, authorisation, tenant scope, and error behaviour.

**For database bugs**, verify relevant Prisma operations, constraints, transactions, and migration safety where practical.

**For calculation bugs**, verify representative inputs, expected outputs, units, precision, factor versions, methodology traceability, and reproducibility.

If a check fails:

- Investigate whether the failure is related to the fix.
- Fix failures introduced by the changes where appropriate.
- Report unrelated pre-existing failures separately.
- Do not claim successful verification when checks have not passed.

If the environment prevents full verification, state exactly what remains unverified.

## 8. Regression and risk assessment

Before finishing, consider whether the fix could affect:

- Existing API consumers.
- Other frontend components.
- Shared hooks or services.
- Organisation isolation.
- User permissions.
- Existing database records.
- Historical activity measurements.
- Historical emission-factor versions.
- Historical calculations.
- Reporting and exports.
- Review and approval workflows.
- Evidence access and storage.
- Existing integrations.

Do not introduce a workaround that conceals the original defect or weakens another part of the system.

If a complete fix is not possible without a larger architectural change, explain the limitation instead of implementing an unsafe partial solution.

Preserve existing user changes, including unrelated staged, unstaged, and untracked files.

Do not use destructive Git commands such as `git reset --hard`, `git clean`, or checkout operations that discard user changes.

## 9. Final response

Report the work using this structure:

### Bug

Briefly restate the reported problem.

### Root cause

Explain what caused the bug and how it affected the application.

Distinguish confirmed causes from any remaining uncertainty.

### Changes made

List each modified file with its exact path and explain the correction.

### Verification

Report:

- Tests added or updated.
- Tests executed and their results.
- Lint, type-check, or build results where applicable.
- Manual verification performed.
- Checks that could not be completed.

### Remaining concerns

Mention unresolved issues, limitations, or risks. State explicitly if none were identified.

### Git status

Summarise:

- Files modified by this fix.
- Pre-existing user changes.
- Remaining staged, unstaged, and untracked changes.

Do not create a commit or push changes unless explicitly requested.

## Rules

- Diagnose before editing.
- Reproduce the bug where practical.
- Fix the root cause, not merely the symptom.
- Make the smallest reliable change.
- Preserve existing user work.
- Do not refactor unrelated code.
- Do not invent files, dependencies, scripts, APIs, or database structures.
- Do not replace the established technology stack.
- Do not weaken security or tenant isolation to make a feature work.
- Do not invent emission factors, GWP values, or methodology assumptions.
- Do not overwrite historical operational or calculation records.
- Do not run destructive commands, database resets, or production migrations without appropriate authorisation.
- Do not claim a fix is verified unless the relevant checks were actually performed.
- Clearly communicate uncertainty when the evidence is insufficient.
- Do not commit or push unless explicitly requested.

**Priority:** Correctness first, security and tenant isolation second, carbon-data integrity third, preservation of existing functionality fourth, and maintainability throughout.
