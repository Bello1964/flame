
---
description: Review current changes, run appropriate checks, and create a well-structured Git commit.
---

# Commit Changes

Prepare and create a Git commit for the current work. Prioritise correctness, security, data integrity, and preservation of the user's existing changes.

## Instructions

### 1. Inspect the current Git state

Run:

- `git status`
- `git diff`
- `git diff --staged`

Review the current branch and all modified, added, deleted, renamed, and untracked files.

Understand what changed and why before staging anything.

### 2. Review all changes

Identify:

- Changes belonging to the intended task.
- Unrelated changes that must remain untouched.
- Accidentally included generated files or build output.
- Dependency folders and unnecessary generated artifacts.
- Environment files, credentials, private keys, tokens, and secrets.
- Accidental deletions or overwrites.
- Unfinished implementations.
- Temporary debugging statements or code.
- Unnecessary changes outside the intended scope.

Never stage `.env` files, credentials, private keys, tokens, or other sensitive information.

Check that `.gitignore` appropriately excludes sensitive and generated files where necessary. Do not modify it unnecessarily.

### 3. Review implementation quality

Before committing, inspect the relevant changes for:

- Obvious bugs or incomplete logic.
- Inconsistent naming or architecture.
- Unnecessary duplication.
- Broken imports or references.
- Incorrect API contracts.
- Potential security vulnerabilities.
- Data-integrity problems.
- Unintended behaviour changes.

Apply the following Carbon Project safeguards where relevant:

**Multi-tenancy and security**
- Organisation-owned resources must remain tenant-scoped.
- Backend authorisation must not rely on client-supplied organisation IDs.
- Role and permission checks must remain enforced server-side.
- Authentication, session, cookie, and CSRF protections must not be weakened.
- Private evidence and files must not become publicly accessible unintentionally.

**Activity data**
- Preserve original measurements and units.
- Keep gas flaring distinct from gas venting.
- Preserve measurement methods and reference conditions.
- Do not assume 24-hour operation when deriving volume from a rate.
- Do not silently overwrite historical activity records.

**Emissions calculations**
- Do not introduce undocumented emission factors or GWP values.
- Preserve emission factor and methodology versions.
- Maintain calculation reproducibility and traceability.
- Do not overwrite historical calculation results.
- Do not treat tCO2e as carbon credits.

**Review and approval**
- Preserve approval history and workflow states.
- Maintain separation of duties.
- Prevent submitters from approving their own submissions.
- Do not present unapproved records as approved results.

**Frontend**
- Preserve loading, error, success, and empty states where applicable.
- Maintain responsive behaviour and accessibility.
- Follow the approved project colour palette.
- Keep animation minimal and purposeful.
- Do not introduce fabricated operational or emissions data.

### 4. Run appropriate project checks

Inspect the relevant `package.json` files and existing scripts before choosing commands.

Run checks appropriate to the changed areas.

**Frontend changes**
- Relevant tests.
- Linting.
- TypeScript checks.
- Production build, where configured.

**Backend changes**
- Relevant tests.
- Linting.
- TypeScript checks.
- Build, where configured.

**Database changes**
- Validate Prisma schema changes.
- Inspect migration files.
- Check migration safety and historical data preservation.
- Run applicable database tests where the environment supports them.

**Documentation or configuration changes**
- Check Markdown structure and links where practical.
- Validate JSON configuration files.
- Confirm referenced paths and filenames are consistent.

Do not invent commands or assume scripts exist.

Do not run destructive database commands or reset user data as part of commit verification.

### 5. Handle failed checks

If a check fails:

1. Identify the failure and its cause.
2. Determine whether it was introduced by the current changes.
3. Explain the failure clearly.
4. Fix straightforward issues caused by the current changes where appropriate.
5. Re-run the relevant check after fixing it.

Do not create the commit if a relevant check fails.

The only exception is when the user explicitly instructs you to proceed despite the failure.

If a check cannot be run because of missing dependencies, unavailable services, environment configuration, or other limitations, report that clearly. Do not claim it passed.

### 6. Prepare a commit message

Use Conventional Commits.

Format:

`type(scope): description`

Suitable types:

- `feat`: new functionality.
- `fix`: bug fix.
- `refactor`: internal restructuring without intended behaviour changes.
- `docs`: documentation.
- `test`: tests.
- `chore`: maintenance and tooling.
- `style`: formatting or styling without functional changes.
- `perf`: performance improvement.

Examples:

- `feat(activity): add flare activity data entry`
- `feat(calculations): implement versioned emissions calculations`
- `fix(auth): enforce organisation membership checks`
- `fix(review): prevent submitters from approving their records`
- `refactor(facilities): simplify facility management service`
- `test(calculations): add emission factor version tests`
- `docs(architecture): update calculation workflow`
- `chore(config): update Claude Code project instructions`

Commit message rules:

- Describe the actual changes, not intended future work.
- Keep the subject concise and specific.
- Use an appropriate scope when useful.
- Do not use vague messages such as `updates`, `changes`, or `fixes`.

### 7. Stage only intended files

Before staging:

- Identify the exact files belonging to the intended commit.
- Preserve unrelated staged and unstaged changes.
- Do not stage files simply to make the working tree clean.
- Do not use `git add .` or `git add -A` without first establishing that every changed and untracked file belongs in the commit.
- Prefer explicitly staging the intended file paths.
- Never overwrite, discard, reset, or clean the user's existing work.

If the intended commit scope is unclear, ask the user before staging.

### 8. Review the staged changes

After staging, run:

- `git status`
- `git diff --staged`

Confirm that:

- Only intended files are staged.
- No secrets or sensitive data are included.
- No unrelated changes have been staged.
- The staged changes match the reviewed implementation.
- No accidental deletions or generated artifacts are included.

If the staged changes are incorrect, do not proceed with the commit. Correct the staging carefully without discarding the user's work.

### 9. Create the commit

Create the commit using the prepared Conventional Commit message.

Before committing, confirm that the required checks have passed or that the user has explicitly authorised proceeding despite a reported failure.

Do not:

- Amend an existing commit unless explicitly requested.
- Force-push.
- Push to a remote repository unless explicitly requested.
- Change branches without permission.
- Rewrite Git history.
- Discard unrelated changes.

### 10. Report the result

After committing, report:

1. **Commit hash:** the actual commit hash.
2. **Commit message:** the exact message used.
3. **Files included:** the files committed.
4. **Checks performed:** commands executed and their results.
5. **Remaining changes:** any staged, unstaged, or untracked files left behind.
6. **Outstanding issues:** any checks that could not be performed or concerns that remain.

Do not claim that a commit was created unless Git confirms success.

## Rules

- Never commit secrets, credentials, private keys, or sensitive user data.
- Never silently discard, overwrite, or reset user changes.
- Never include unrelated files just to make the working tree clean.
- Never stage files without reviewing their contents.
- Never claim tests or checks passed unless they were actually executed successfully.
- Never bypass a failed relevant check without explicit user authorisation.
- Never amend commits or push changes without explicit permission.
- Never weaken tenant isolation, authorisation, validation, or data-integrity safeguards to make a commit pass.
- If the intended scope of the commit is unclear, ask the user before staging files.
- If the repository has no changes to commit, report that instead of creating an empty commit.

**Priority:** Preserve the user's work, protect sensitive information, verify the implementation, and commit only the intended changes.
