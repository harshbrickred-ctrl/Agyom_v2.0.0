# Local Setup Guide — SST

## Purpose

Enable a developer to clone the monorepo and run the Staffing Tracker (SST) stack locally from zero.

## Audience

Developers.

## Scope

**Primary path:** Docker Compose for Postgres + native `pnpm` for the NestJS API and React/Vite dashboard.

**Alternate path:** Full Docker production-style stack (`api` + `web` + Postgres) — see [DEPLOY_V1.md](./DEPLOY_V1.md).

## Prerequisites

| Tool | Version / notes |
|------|-----------------|
| Node.js | 22 LTS |
| pnpm | Repo pins `pnpm@11.11.0` (`corepack enable` recommended) |
| Docker Desktop / Engine | For Postgres |
| Git | To clone |

### Ports

| Service | Port |
|---------|------|
| Postgres (host) | **5433** → container `5432` |
| API | **3000** |
| Dashboard (Vite) | **5173** |

---

## 1. Clone the repository

```bash
git clone https://github.com/harshbrickred-ctrl/Agyom_v2.0.0.git
cd Agyom_v2.0.0
```

Use your fork or internal remote URL if different. The local folder name may be `SST_v1_monorepo` or similar.

---

## 2. Create the environment file

```bash
cp .env.example .env
```

Edit `.env` and set at least:

```env
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=YourStrongPassword123!
```

Keep or adjust these defaults from `.env.example`:

| Variable | Local default / note |
|----------|----------------------|
| `DATABASE_URL` | `postgresql://sst:sst@localhost:5433/sst?schema=public` |
| `JWT_ACCESS_SECRET` | Change; use at least ~32 characters |
| `JWT_REFRESH_SECRET` | Change; use at least ~32 characters |
| `JWT_ACCESS_TTL` | `15m` |
| `JWT_REFRESH_TTL` | `7d` |
| `PORT` | `3000` |
| `CORS_ORIGIN` | `http://localhost:5173` |
| `LOG_LEVEL` | `info` |
| `VITE_API_BASE_URL` | `/api/v1` |
| `APP_LOGIN_URL` | `http://localhost:5173` |

**Optional**

- **Email:** set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Leave `SMTP_HOST` empty to disable outbound mail locally.
- **Resume parse:** set `OPENAI_API_KEY` (and base URL / model as documented in `.env.example`). Leave empty to extract name/email/mobile from the file only.

The Nest API loads env from the monorepo root `.env` (see `ConfigModule` `envFilePath` in `apps/api`).

There is **no** shipped default admin password — you must set `SEED_ADMIN_*` before seeding.

---

## 3. Start Postgres

```bash
docker compose -f docker/docker-compose.yml up -d postgres
```

Confirm the container is up and mapped to host port **5433**:

```bash
docker ps --filter "name=sst"
```

Compose credentials match `.env.example`: user `sst`, password `sst`, database `sst`.

If port 5433 is already in use, stop the conflicting container or change the host port mapping in `docker/docker-compose.yml` and update `DATABASE_URL` accordingly.

---

## 4. Install dependencies

```bash
pnpm install
```

---

## 5. Build shared packages and generate Prisma client

```bash
pnpm --filter @sst/shared-types build
pnpm --filter @sst/shared-utils build
pnpm --filter @sst/api prisma:generate
```

---

## 6. Migrate and seed the database

Apply migrations (non-interactive, safe for existing local DBs that track migrations):

```bash
pnpm --filter @sst/api exec prisma migrate deploy
```

Or for a fresh local database with Prisma’s interactive migrate:

```bash
pnpm --filter @sst/api exec prisma migrate dev
```

Then seed admin + lookups:

```bash
pnpm --filter @sst/api prisma:seed
```

Root shortcuts also exist:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Seed creates:

1. Lookup values (priority, candidate stage, offer status, onboarding status, etc.)
2. The admin user from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`

Additional demo/volume seed scripts under `apps/api/prisma/` are optional and not required for first login.

More detail: [SEED_AND_MIGRATION.md](./SEED_AND_MIGRATION.md).

---

## 7. Run the applications

### Option A — Turbo (API + dashboard together)

```bash
pnpm dev
```

### Option B — Separate terminals

API:

```bash
pnpm --filter @sst/api dev
```

Dashboard (`recruitment-dashboard` in `apps/RecuirementDashboard`):

```bash
pnpm --filter recruitment-dashboard dev
```

Vite proxies `/api` → `http://localhost:3000` (see `apps/RecuirementDashboard/vite.config.js`), so the SPA can call the API same-origin without CORS issues during local dev.

---

## 8. Verify

| Check | URL |
|-------|-----|
| Dashboard | http://localhost:5173 |
| API health | http://localhost:3000/health |
| Swagger | http://localhost:3000/api/docs |

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

---

## Minimal command checklist

```bash
git clone <repo-url> && cd <repo>
cp .env.example .env
# Edit .env: set SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, JWT secrets

docker compose -f docker/docker-compose.yml up -d postgres
pnpm install
pnpm --filter @sst/shared-types build
pnpm --filter @sst/shared-utils build
pnpm --filter @sst/api prisma:generate
pnpm --filter @sst/api exec prisma migrate deploy
pnpm --filter @sst/api prisma:seed
pnpm dev
```

---

## Local networking

- Dashboard: Vite on `5173`, proxy `/api` → API `3000`
- API CORS: `CORS_ORIGIN=http://localhost:5173`
- Compose network name: `sst_net`
- Postgres from the host: `localhost:5433`

---

## Full Docker stack (optional)

To run API + web as containers (production-style Compose) instead of `pnpm dev`:

```bash
cp docker/.env.prod.example docker/.env.prod
# Edit JWT_* and optional SEED_ADMIN_* for first boot
docker compose -f docker/docker-compose.prod.yml up -d --build
```

| Service | URL |
|---------|-----|
| Web | http://localhost |
| API health | http://localhost:3000/health |

See [DEPLOY_V1.md](./DEPLOY_V1.md) and [DOCKER_COMPOSE.md](./DOCKER_COMPOSE.md).

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| DB connection refused / P1001 | Start Postgres; confirm `DATABASE_URL` uses port **5433** |
| Port 5433 already in use | Stop other Postgres containers or remap the host port |
| Seed fails missing admin env | Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` |
| Dashboard cannot reach API | Confirm API on `3000`; check Vite `/api` proxy |
| pnpm version errors | `corepack enable` and use the version in root `packageManager` |
| Shared package import errors | Rebuild `@sst/shared-types` and `@sst/shared-utils` |

More: [../21-guides/TROUBLESHOOTING_AND_FAQ.md](../21-guides/TROUBLESHOOTING_AND_FAQ.md).

---

## References

- [DOCKER_COMPOSE.md](./DOCKER_COMPOSE.md)
- [SEED_AND_MIGRATION.md](./SEED_AND_MIGRATION.md)
- [DEPLOY_V1.md](./DEPLOY_V1.md)
- [../13-monorepo/ENV_AND_VERSIONING.md](../13-monorepo/ENV_AND_VERSIONING.md)
- Root [README.md](../../README.md)
