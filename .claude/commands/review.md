---
description: Perform a thorough, evidence-based code review of specified changes or the current Git working tree, prioritising security, tenant isolation, carbon-accounting integrity, and architectural consistency.
---

# Code Review

Act as a senior software engineer conducting a rigorous, practical code review of Flame, the carbon management platform.

Review the actual implementation, not merely its intended behaviour. Prioritise correctness, security, multi-tenancy, data integrity, carbon-accounting accuracy, maintainability, and consistency with the established architecture.

**This is a review-only operation. Do not modify files, implement fixes, stage changes, create commits, or alter the database.**

## Review scope

Review the following scope when provided:

$ARGUMENTS

If no specific scope is provided, review the current Git working tree, including staged and unstaged changes.

## 1. Establish the review context

Before reviewing code:

1. Read the root `CLAUDE.md`.
2. Read relevant project documentation and applicable Claude Code skills.
3. Inspect the repository structure to understand the actual implementation.
4. Run `git status` and inspect:
   - `git diff`
   - `git diff --staged`
   - Relevant untracked files, where accessible.
5. Identify the files, modules, dependencies, and workflows affected.
6. Read surrounding implementation and related tests where necessary.
7. Trace important operations across the frontend, API, services, database, and external integrations where applicable.

Do not assume that the diff provides enough context to establish correctness.

If the user specifies files or a feature, prioritise that scope. Inspect related code when necessary to identify defects that cross module boundaries.

Do not review unrelated parts of the repository unless they are directly relevant to a finding.

## 2. Apply evidence-based review principles

Every reported defect must be supported by evidence from the actual implementation.

For each potential finding:

1. Identify the relevant code path.
2. Trace the inputs, processing, permissions, persistence, and outputs involved.
3. Verify the behaviour against the applicable project requirements.
4. Determine whether the issue is actually reachable and reproducible from the code.
5. Establish its practical impact.
6. Identify the smallest appropriate correction.

Do not:

- Report hypothetical risks as confirmed defects.
- Infer missing functionality from a filename or an empty-looking component without checking its usage.
- Treat every absence of a test as proof of a defect.
- Report personal style preferences as functional problems.
- Recommend changes that conflict with established project decisions.
- Invent implementation details, regulatory requirements, emission factors, or calculation assumptions.

Distinguish confirmed defects, potential risks, and improvement recommendations.

## 3. Architecture and code quality

Check whether the implementation:

- Respects the modular-monolith architecture.
- Maintains the frontend/backend separation.
- Follows the established project structure and naming conventions.
- Uses the confirmed React, Vite, TypeScript, Express, PostgreSQL, and Prisma stack consistently.
- Reuses existing services, components, hooks, schemas, and utilities where appropriate.
- Maintains clear separation between routes, controllers, services, repositories, validation, and presentation.
- Avoids unnecessary duplication, coupling, abstractions, and dependencies.
- Handles errors consistently.
- Uses TypeScript appropriately without unnecessary `any` or unsafe type assertions.
- Preserves existing functionality unless a change intentionally modifies it.
- Avoids unnecessary changes outside the requested scope.

Do not propose replacing the established framework, database, or architecture.

Do not assume a dependency, script, utility, or architectural component exists until the repository confirms it.

## 4. Security and multi-tenancy

Treat tenant isolation as a critical security boundary.

### Authentication and authorisation

Verify that:

- Protected operations require valid authentication.
- Permissions are enforced by the backend, not merely by frontend controls.
- Role checks are applied to sensitive operations.
- Users cannot perform actions outside their assigned permissions.
- Session creation, validation, expiry, and revocation follow the established authentication model.
- HTTP-only cookies use appropriate security settings.
- CSRF protection is correctly applied where required.
- Passwords and sensitive credentials are never exposed.
- Error responses do not disclose internal implementation details or sensitive information.

### Organisation isolation

Verify that:

- Every organisation-owned resource is accessed within an authorised organisation context.
- Organisation access is derived and enforced by the backend through authenticated membership.
- Client-supplied organisation IDs are never accepted as proof of authorisation.
- Resource lookups enforce tenant scope rather than relying on frontend filtering.
- Related records cannot be accessed through an authorised parent belonging to another organisation.
- Tenant isolation is preserved in list, detail, update, delete, export, reporting, and background-processing operations.

Pay particular attention to:

- Facilities.
- Assets.
- Flare sources.
- Activity records.
- Evidence files.
- Emission factors.
- Calculations.
- Approvals.
- Reports.
- Mitigation actions.

### File and data security

Check that:

- File uploads validate file type, size, and other relevant constraints.
- File access checks the requesting user's permissions and organisation membership.
- Object-storage references do not expose unrestricted private resources.
- Sensitive data is not leaked through logs, API responses, URLs, or error messages.
- Secrets are not committed or exposed in frontend code.

**Never treat a hidden button, protected frontend route, or client-side organisation filter as sufficient authorisation.**

## 5. Carbon-management domain integrity

Validate implementation against the project's established carbon-management rules.

### 5.1 Activity data

Verify that:

- Gas flaring and gas venting remain distinct activity types.
- Routine, non-routine, and emergency flaring are not incorrectly conflated.
- Activity type is preserved through validation, storage, calculation, and reporting.
- Measurement values have explicit units.
- Original entered values and units are preserved.
- Standardised values can be traced to their original measurements.
- Reference conditions are explicit and are not silently assumed or changed.
- Unit conversions are dimensionally correct.
- Daily and reporting-period records are handled according to their actual time boundaries.
- Volume is not derived by assuming 24-hour operation when duration is unknown.
- Rate, duration, and volume consistency is checked where sufficient information exists.
- Overlapping reporting periods are identified and appropriately flagged.
- Estimated measurements include an explanation.
- Measurement methods are captured.
- An `Other` measurement method includes an appropriate description.
- Missing evidence is handled according to the project's validation rules.
- Missing required technical inputs prevent unsupported calculations.

### 5.2 Units and reference conditions

Check the treatment of supported units, including:

- MMscf/d.
- MMscf.
- Bcf.
- Sm³/d.
- Sm³.
- MMSm³/d.
- MMSm³.

Verify that:

- Rate units are not confused with volume units.
- Conversion factors are applied correctly.
- Standardisation uses the correct reference conditions.
- The initial reference conditions of 60°F and 14.73 psia are treated as project defaults, not universal assumptions.
- Configurable organisation reference conditions are respected where implemented.
- Original measurements and conversion details remain traceable.

Do not introduce conversion constants or reference conditions without an authoritative basis.

### 5.3 Emission factors and methodologies

Verify that:

- Emission factors are traceable to their sources.
- Factor values, units, gases, pollutants, activities, and applicability are represented correctly.
- Factor versions are preserved.
- Only approved and applicable factor versions are used for approved calculations.
- Draft, under-review, superseded, and withdrawn factors are handled appropriately.
- Historical factor versions are not overwritten.
- Methodology applicability is checked.
- GWP values have traceable sources, versions, and time horizons.
- Missing required inputs are not silently replaced with invented assumptions.
- Flaring and venting receive the treatment required by the applicable methodology.

Do not assume that a factor is valid merely because it exists in the database.

Do not assume that IPCC, GHG Protocol, or Nigerian regulatory requirements are interchangeable.

Do not claim NUPRC or other regulatory compliance without verified requirements and evidence.

### 5.4 Calculation integrity

Verify that:

- Calculation formulas are dimensionally and mathematically correct.
- Calculations use the correct activity type and applicable methodology.
- Calculation inputs and outputs are preserved.
- Exact emission-factor and methodology versions are recorded.
- GWP values and sources are recorded.
- Assumptions and reference conditions are traceable.
- Individual gas emissions and total tCO2e are represented correctly where required.
- Accounting precision is preserved.
- Rounding is applied for presentation rather than prematurely altering stored results.
- Historical calculations remain reproducible.
- Changes to emission factors do not silently alter previous calculation results.
- Recalculation creates a new traceable calculation version.
- Approved historical records are not silently overwritten.

Treat the illustrative estimate of approximately 55 tCO2e per MMscf of gas flared as an example only. It must not be treated as a universal or authoritative emission factor.

**Never approve a calculation merely because it returns a numerical result.**

### 5.5 Review and approval workflow

Verify that:

- Draft, Submitted, Under Review, Needs Correction, Awaiting Approval, and Approved states are handled consistently.
- Invalid state transitions are rejected.
- Only authorised users can review and approve records.
- Submitters cannot approve their own submissions.
- Reviewer comments and correction requests are preserved.
- Approval history, timestamps, and responsible users are traceable.
- Approved records cannot be silently changed.
- Corrections preserve the required history.
- Only approved records contribute to official approved reports.
- Preliminary figures are clearly distinguished from approved figures.

### 5.6 Carbon-credit boundaries

Verify that the implementation does not:

- Treat one tonne of tCO2e as automatically equivalent to one issued carbon credit.
- Represent emissions calculations as credit issuance.
- Claim that the platform independently verifies or certifies credits.
- Present credit eligibility as equivalent to issuance.
- Mix future marketplace transactions with the initial emissions-management workflow.

Carbon-credit eligibility, validation, verification, issuance, ownership, and retirement must remain distinct concepts.

## 6. Database and API review

Inspect relevant Prisma models, migrations, queries, services, and API routes.

### Database

Check:

- Entity relationships and referential integrity.
- Organisation ownership and tenant-scoped relationships.
- Foreign-key constraints.
- Unique constraints and indexes.
- Appropriate Decimal precision for accounting quantities.
- Nullability and default values.
- Cascade and deletion behaviour.
- Historical record preservation.
- Transaction boundaries.
- Concurrency and race-condition risks.
- Migration safety and reversibility where practical.

Do not recommend destructive schema changes without explaining their data implications.

Prisma migrations must remain the established schema-change mechanism. Do not make untracked schema changes or introduce ad-hoc raw SQL without an explicit reason and authorisation.

### API

Check:

- Request validation.
- Authentication and authorisation middleware.
- Tenant-scoped resource access.
- Response consistency.
- Correct HTTP status codes.
- Error handling.
- Pagination, filtering, and sorting.
- Input sanitisation where applicable.
- Duplicate submission protection where required.
- Transactional consistency.
- Prevention of mass assignment and unintended field updates.

Trace API behaviour beyond the route handler when the actual security or business logic is implemented in another layer.

## 7. Frontend review

Apply this section when frontend code is within scope.

Check:

- Loading, error, success, and empty states.
- Form validation and useful error presentation.
- Responsive behaviour across mobile, tablet, and desktop.
- Accessibility, semantic HTML, and keyboard navigation.
- Correct use of React state and lifecycle behaviour.
- Appropriate TanStack Query usage, cache invalidation, and stale-data handling.
- Correct API integration and response handling.
- Permission-aware interface behaviour.
- Accurate status labels and workflow actions.
- Clear distinction between preliminary and approved data.
- Consistency with the project's established UI design skill and approved colour palette.
- Purposeful animation and reduced-motion support.
- Prevention of fabricated operational, emissions, or financial data.

The frontend must not be the authority for:

- Emissions calculations.
- Organisation access.
- User permissions.
- Approval decisions.
- Official reporting status.

Check that displayed figures, units, statuses, and reporting periods accurately represent the backend data.

## 8. Tests and verification

Inspect relevant existing tests and determine whether they actually exercise the changed behaviour.

Where appropriate, review coverage for:

- Authentication and authorisation.
- Cross-tenant access attempts.
- Input validation.
- Unit conversion.
- Reporting-period boundaries.
- Rate and volume consistency.
- Emission-factor selection and versioning.
- Calculation reproducibility.
- Missing calculation inputs.
- Approval restrictions.
- Historical record preservation.
- API error handling.
- Frontend loading and error states.

Run focused, relevant checks when they can provide useful evidence.

Before choosing commands:

1. Inspect the relevant `package.json` files and existing scripts.
2. Identify the project's actual test and validation tools.
3. Prefer targeted checks for the affected module.
4. Run broader checks only when justified by the scope.

Do not invent commands or assume scripts exist.

Do not modify files to make tests pass.

Clearly report:

- Checks that were executed.
- Checks that passed.
- Checks that failed.
- Checks that could not be run and why.

A passing test suite does not automatically establish that the implementation is correct.

## 9. Validate and classify findings

Before reporting a finding, confirm that:

- The relevant code exists.
- The issue is within the review scope or directly affects it.
- The behaviour is supported by the implementation or a demonstrable execution result.
- The stated impact is realistic.
- The recommendation addresses the actual cause.

Use these severity levels:

**Critical**
- Confirmed cross-tenant data exposure.
- Severe security vulnerabilities.
- Destructive or irreversible data loss.
- Unauthorised approval of records.
- Fundamentally incorrect emissions calculations with serious reporting consequences.

**High**
- Significant authorisation failures.
- Incorrect calculation logic.
- Serious business-rule violations.
- Historical calculation or audit-trail corruption.
- Major database or API integrity defects.

**Medium**
- Incorrect or incomplete functionality.
- Missing important validation.
- Significant edge-case failures.
- Reliability problems.
- Maintainability issues that create a material risk.

**Low**
- Minor inconsistencies.
- Small usability or accessibility issues.
- Non-critical documentation or maintainability improvements.

Do not inflate severity. Explain the actual impact and conditions under which the issue occurs.

## 10. Required review output

Present confirmed findings first, ordered by severity.

For every finding, use this structure:

### [SEVERITY] Concise finding title

- **Location:** Exact file path and relevant line range, function, or component.
- **Evidence:** The actual implementation or execution behaviour establishing the issue.
- **Problem:** What is wrong.
- **Impact:** Why it matters and who or what is affected.
- **Recommendation:** The practical correction.

Where possible, identify the specific affected code path rather than pointing to an entire file.

Do not invent line numbers. If exact lines cannot be established, identify the relevant function or component instead.

After the findings, provide:

### Review summary

- **Overall assessment:** A concise assessment of the reviewed changes.
- **Critical findings:** Count and brief description.
- **High findings:** Count and brief description.
- **Medium findings:** Count and brief description.
- **Low findings:** Count and brief description.
- **Missing test coverage:** Important untested behaviour.
- **Checks performed:** Actual commands and results.
- **Clarifications required:** Questions that prevent a reliable conclusion, if any.
- **Merge recommendation:** One of:
  - Safe to merge.
  - Merge after addressing specified findings.
  - Do not merge until critical issues are resolved.
  - Unable to determine from the available evidence.

If no findings are identified, explicitly state:

**No confirmed defects were identified within the reviewed scope.**

Then state the files and behaviours reviewed, checks performed, and any limitations. Do not imply that the entire application is defect-free.

## Rules

- Review actual implementation, not assumptions or intentions.
- Do not modify files during a review.
- Do not stage, commit, push, or deploy changes.
- Do not alter database records or run destructive commands.
- Do not conceal failed checks or incomplete review coverage.
- Do not invent file paths, line numbers, test results, or implementation details.
- Do not confuse recommendations with confirmed defects.
- Do not report speculative risks as established vulnerabilities.
- Do not assume regulatory compliance without verified requirements.
- Do not invent emission factors, GWP values, or methodology rules.
- Prioritise tenant isolation, security, calculation integrity, and historical traceability over cosmetic improvements.