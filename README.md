# Flame

Multi-tenant carbon accounting for oil and gas operators in Nigeria and West Africa. Flame records gas-flaring activity data, calculates greenhouse-gas emissions (tCO2e) against versioned methodologies, and runs it through review, approval and reporting.

```
Organisation → Facility → Asset → Flare Source → Activity Data → Validation
  → Emissions Calculation (tCO2e) → Review & Approval → Reporting
```

> Calculating tCO2e does not create, imply or issue carbon credits. The carbon-credit marketplace is out of scope.

---

## Contents

- [Architecture](#architecture)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Testing](#testing)
- [Production deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Further reading](#further-reading)

---

## Architecture

A modular monolith: one Express API, one React SPA and one PostgreSQL database, in an npm workspaces monorepo.

```
apps/
  api/        Express 5 + TypeScript REST API, Prisma schema, migrations, operator scripts
  web/        React 19 + Vite SPA (Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form + Zod)
packages/
  shared/     Types, constants and Zod schemas used by both apps (no business logic)
docs/
  architecture/ARCHITECTURAL_WORKFLOW.md   Design decisions and rules
docker-compose.yml   Local PostgreSQL 18
Procfile             Heroku process and release commands
```

| Concern        | Implementation                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Auth           | Server-side sessions in PostgreSQL, HTTP-only cookie (`flame_sid`), argon2id, CSRF origin check |
| Tenancy        | `organisationId` on every tenant row, enforced in services, plus PostgreSQL Row-Level Security  |
| Database roles | Migrations run as the schema owner; the API runs as a restricted `flame_app` login              |
| Email          | Transactional outbox, delivered through Resend (dev mailbox locally)                            |
| API docs       | OpenAPI 3.1 at `/api/v1/openapi.json`, rendered at `/docs`                                      |
| Logging        | Structured JSON (pino)                                                                          |

In development, Vite (`:5173`) proxies `/api` to the API (`:4000`). In production the API serves the built SPA from the same origin.

---

## Requirements

| Tool           | Version              | Notes                                                           |
| -------------- | -------------------- | --------------------------------------------------------------- |
| Node.js        | **24.x**             | Pinned in `package.json` `engines`                              |
| npm            | Bundled with Node 24 | The only supported package manager (`package-lock.json`)        |
| Docker Desktop | Docker Compose v2    | Runs local PostgreSQL. Any **PostgreSQL 15+** server also works |
| Git            | Any recent           |                                                                 |

**Free ports:** `4000` (API), `5173` (web), `5434` (PostgreSQL, bound to `127.0.0.1`). Port 5434 avoids clashing with locally installed PostgreSQL services on 5432/5433.

**PostgreSQL 15+ is required.** The `flame_app` role relies on `PUBLIC` having no `CREATE` on the `public` schema, which is the default only from 15 onwards.

**Optional, deployment only:** Heroku CLI, Neon CLI, a Resend account.

---

## Local setup

Run from the repository root. Commands work in PowerShell, Bash and zsh.

**1. Install dependencies**

```bash
npm install
```

`postinstall` generates the Prisma client into `apps/api/src/generated/` (git-ignored).

**2. Start PostgreSQL**

```bash
npm run db:up
```

Starts the `flame-db` container (PostgreSQL 18, database `flame`, user `flame`) with a persistent volume.

**3. Create the API environment file**

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

- In `DATABASE_URL`, replace `choose-a-local-password` with a password of 12+ characters. Step 6 creates this login.
- Set `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` (12+ characters). This is your first sign-in.
- Optional: set `SEED_PLATFORM_ADMIN_1_*` and `SEED_PLATFORM_ADMIN_2_*`. Two administrators are needed to approve a methodology edition, because nobody approves their own.

**4. Build the shared package**

```bash
npm run build:shared
```

Both apps import `@flame/shared` from its compiled `dist/`. Rebuild after changing anything in `packages/shared`.

**5. Apply migrations** (as the schema owner, `MIGRATION_DATABASE_URL`)

```bash
npm run prisma:deploy -w @flame/api
```

**6. Create the restricted app login** (from the username and password in `DATABASE_URL`)

```bash
npm run db:create-app-user -w @flame/api
```

Safe to re-run; an existing login has its password updated.

**7. Seed development data**

```bash
npm run db:seed -w @flame/api
```

Creates one organisation, its owner and any configured Platform Administrators. No operational or emissions data is seeded. Refuses to run when `NODE_ENV=production`.

**8. Run the app** (two terminals)

```bash
npm run dev:api     # http://localhost:4000  (tsx watch)
npm run dev:web     # http://localhost:5173  (Vite)
```

Open <http://localhost:5173> and sign in with the seed owner.

**9. Verify**

| Check            | URL                                   | Expected                                |
| ---------------- | ------------------------------------- | --------------------------------------- |
| API and database | <http://localhost:4000/api/v1/health> | `{"status":"ok","database":"ok"}`       |
| API reference    | <http://localhost:5173/docs>          | Swagger UI                              |
| Dev mailbox      | <http://localhost:5173/dev/mailbox>   | Invitation and reset emails, with links |

The dev mailbox exists only when `NODE_ENV=development` and `RESEND_API_KEY` is empty.

---

## Configuration

The API reads `apps/api/.env` (git-ignored). Variables are validated with Zod at startup; an invalid value stops the process with a readable error. The web app needs no environment variables.

### Required

| Variable                 | Purpose                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | Restricted app login (`flame_app` member). The API connects as this user                                            |
| `MIGRATION_DATABASE_URL` | Schema owner. Used only by Prisma migrations and `db:create-app-user`. Must be a different user from `DATABASE_URL` |

### Optional (defaults shown)

| Variable                              | Default                 | Purpose                                                                        |
| ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`                            | `development`           | `development` \| `test` \| `production`                                        |
| `PORT`                                | `4000`                  | API port. Heroku sets it                                                       |
| `LOG_LEVEL`                           | `info`                  | `fatal` … `trace`, or `silent`                                                 |
| `WEB_ORIGIN`                          | `http://localhost:5173` | Allowed origin for state-changing requests; base of email links                |
| `TRUST_PROXY`                         | `0`                     | Reverse-proxy hops to trust for client IPs (`1` on Heroku)                     |
| `SESSION_IDLE_MINUTES`                | `60`                    | Idle session timeout                                                           |
| `SESSION_ABSOLUTE_HOURS`              | `12`                    | Absolute session lifetime                                                      |
| `LOGIN_RATE_LIMIT_MAX`                | `10`                    | Failed sign-ins per client IP per window                                       |
| `LOGIN_ACCOUNT_RATE_LIMIT_MAX`        | `5`                     | Failed sign-ins per account from one IP                                        |
| `LOGIN_ACCOUNT_GLOBAL_RATE_LIMIT_MAX` | `20`                    | Failed sign-ins per account from all IPs                                       |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES`     | `15`                    | Rate-limit window                                                              |
| `RESEND_API_KEY`                      | empty                   | Resend key. **Required in production.** Empty = dev mailbox                    |
| `EMAIL_FROM`                          | empty                   | Sender, e.g. `Flame <invitations@your-domain>`. Required with `RESEND_API_KEY` |

### Development seed only

`SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `SEED_PLATFORM_ADMIN_{1,2}_EMAIL`, `SEED_PLATFORM_ADMIN_{1,2}_PASSWORD`. Administrator 1 becomes the supreme Platform Administrator if none exists.

### Production behaviour

With `NODE_ENV=production` the API:

- Uses a `Secure` cookie with the `__Host-` prefix (HTTPS only).
- Refuses to start without `RESEND_API_KEY` and `EMAIL_FROM`.
- Refuses to start if its database role is a superuser, has `BYPASSRLS`, owns or can modify `audit_logs`, or finds RLS disabled on a tenant table. In development these are warnings.
- Serves the built SPA from `apps/web/dist`.

> Never commit `.env`, `.env.*` or `.neon`. Only `.env.example` is tracked.

---

## Scripts

### Root

| Command                           | Description                                     |
| --------------------------------- | ----------------------------------------------- |
| `npm run dev:api` / `dev:web`     | Run the API / web app in watch mode             |
| `npm run build`                   | Build shared, API and web (production build)    |
| `npm run build:shared`            | Build `@flame/shared`                           |
| `npm run typecheck`               | Type-check every workspace                      |
| `npm run lint` / `lint:fix`       | ESLint (typescript-eslint strict, type-checked) |
| `npm run format` / `format:check` | Prettier                                        |
| `npm test`                        | All tests (API integration + web component)     |
| `npm run db:up` / `db:down`       | Start / stop local PostgreSQL                   |

### API (`npm run <script> -w @flame/api`)

| Script                                 | Description                                                       |
| -------------------------------------- | ----------------------------------------------------------------- |
| `prisma:migrate`                       | Create and apply a new migration (`prisma migrate dev`)           |
| `prisma:deploy`                        | Apply pending migrations (`prisma migrate deploy`)                |
| `prisma:generate`                      | Regenerate the Prisma client                                      |
| `prisma:studio`                        | Open Prisma Studio                                                |
| `db:create-app-user`                   | Create or update the restricted app login                         |
| `db:seed`                              | Development seed (refused in production)                          |
| `db:bootstrap-admins`                  | Production: create first Platform Administrators (shell env only) |
| `db:transfer-supreme-admin -- <email>` | Transfer the supreme Platform Administrator role                  |
| `docs:schemas`                         | Regenerate OpenAPI response schemas after changing shared types   |

**Migration rule:** Prisma does not wrap migrations in a transaction, so every `migration.sql` must be wrapped in `BEGIN; … COMMIT;` by hand. Never edit an applied migration; add a new one.

---

## Testing

```bash
npm test                          # everything
npm test -w @flame/api            # API integration tests only
npm test -w @flame/web            # web component tests only
```

API tests run against real PostgreSQL. They do **not** read `apps/api/.env`:

- Default target: `flame_test` on the local Docker server (`localhost:5434`). It is created and migrated automatically; just run `npm run db:up` first.
- Override with `TEST_DATABASE_URL` (e.g. in CI). The database name **must end in `_test`**; anything else is refused, because the test reset is destructive.
- Each run creates a `flame_app_test` login with a fresh random password. It belongs to the cluster-wide `flame_app` role, so use only a dedicated or throwaway server.
- Test files run sequentially against one shared database.

Before opening a pull request:

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

---

## Production deployment

Target: **one Heroku app** (API + built SPA, same origin) and **Neon PostgreSQL**. Heroku Postgres Essential plans can't create roles, so they can't host the restricted `flame_app` login or Row-Level Security.

**Build and release** (automatic on `git push heroku main`):

- The Node buildpack runs `npm ci`, then `npm run build`.
- `Procfile`: `release` runs `prisma:deploy` as `MIGRATION_DATABASE_URL`; `web` runs `node apps/api/dist/server.js`.

**Heroku config vars**

```
NODE_ENV=production
DATABASE_URL=<restricted app login, Neon direct host, sslmode=verify-full>
MIGRATION_DATABASE_URL=<Neon owner, direct host, sslmode=require>
WEB_ORIGIN=https://<app>.herokuapp.com        # exact, no trailing slash
TRUST_PROXY=1
RESEND_API_KEY=<key>
EMAIL_FROM=Flame <sender@verified-domain>
LOG_LEVEL=info
```

Use Neon's **direct** host (no `-pooler`). The pooler rejects the `idle_in_transaction_session_timeout` connection parameter, and migrations need a session. URL-encode special characters in passwords.

**First deployment** (from `apps/api`, operator machine, PowerShell):

```powershell
$env:MIGRATION_DATABASE_URL = "<Neon owner, direct>"
$env:DATABASE_URL = "postgresql://flame_app_user:<password>@<host>/<db>?sslmode=require"
npx prisma migrate deploy
npm run db:create-app-user
$env:PLATFORM_ADMIN_1_EMAIL = "..."; $env:PLATFORM_ADMIN_1_PASSWORD = "..."
$env:PLATFORM_ADMIN_2_EMAIL = "..."; $env:PLATFORM_ADMIN_2_PASSWORD = "..."
npm run db:bootstrap-admins
```

Check that Prisma prints the Neon host, not `localhost`: shell variables override `apps/api/.env`. `db:bootstrap-admins` never reads `.env`.

Then:

1. `heroku create <name> --region eu`, set the config vars, `git push heroku main`, `heroku ps:type web=eco`.
2. Sign in as a Platform Administrator. A **second** administrator approves methodology edition 1, which migrations ship as a draft.
3. Create the first organisation and invite its owner.

**If the migration user lacks `CREATEROLE`**, a database administrator must create `flame_app` (NOLOGIN), the app login in that role, and grant `flame_app` to the migration user `WITH ADMIN OPTION`, **before** the first migration. See §12.1 of the architecture document.

**Limits:** sign-in rate limits are held in memory, so they apply per instance; move them to a shared store before scaling beyond one dyno. An Eco dyno sleeps after 30 minutes idle, and queued emails are sent when it wakes.

Full procedure: [ARCHITECTURAL_WORKFLOW.md §12](docs/architecture/ARCHITECTURAL_WORKFLOW.md).

---

## Troubleshooting

| Symptom                                                    | Cause and fix                                                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Invalid environment configuration` on start               | A variable is missing or malformed. The message names it. Compare with `apps/api/.env.example`                                                 |
| `Cannot find module '@flame/shared'` or stale shared types | Run `npm run build:shared`                                                                                                                     |
| `Test database server unreachable`                         | Run `npm run db:up` and wait for the container to report healthy                                                                               |
| `tsx` fails with a missing `@esbuild/<platform>` package   | npm lockfile bug. Run `npm ls esbuild` for the version, then `npm install @esbuild/<platform>@<version> --no-save` (e.g. `@esbuild/win32-x64`) |
| Prisma client errors after pulling                         | Run `npm run prisma:generate -w @flame/api`, then `npm run prisma:deploy -w @flame/api`                                                        |
| `db:create-app-user`: same user                            | `DATABASE_URL` and `MIGRATION_DATABASE_URL` must use different usernames                                                                       |
| API warns about its database role                          | `DATABASE_URL` points at the owner or a superuser. Use the restricted login from step 6                                                        |
| Port 5434 already in use                                   | Stop the other service, or change the host port in `docker-compose.yml` and every URL that uses it                                             |
| Sign-in works locally but not in production                | `WEB_ORIGIN` must exactly match the browser origin, and the site must be served over HTTPS                                                     |
| All users hit the IP rate limit together behind a proxy    | Set `TRUST_PROXY` to the number of proxy hops (`1` on Heroku)                                                                                  |
| Invitation emails never arrive                             | Locally, check `/dev/mailbox`. With `onboarding@resend.dev`, Resend delivers only to the account owner; verify a sending domain                |

Reset the local database (destroys all local data):

```bash
docker compose down -v && npm run db:up
```

Then repeat setup steps 5–7.

---

## Further reading

- [docs/architecture/ARCHITECTURAL_WORKFLOW.md](docs/architecture/ARCHITECTURAL_WORKFLOW.md): modules, roles and permissions, review and approval workflow, calculation integrity, security baseline, deployment.
- [CLAUDE.md](CLAUDE.md): engineering rules for this repository (tenancy, units, calculation traceability).
- API reference: `/docs` on any running instance.
