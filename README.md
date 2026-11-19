# Staffing Tracker (SST)

Greenfield MVP: NestJS API + React/Vite SPA in a Turborepo monorepo.

## Quick start (local pnpm)

```bash
cp .env.example .env
# Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env
docker compose -f docker/docker-compose.yml up -d postgres
pnpm install
pnpm --filter @sst/shared-types build
pnpm --filter @sst/shared-utils build
pnpm --filter @sst/api prisma:generate
pnpm --filter @sst/api exec prisma migrate deploy
pnpm --filter @sst/api prisma:seed
pnpm dev
```

Postgres is published on **host port 5433** (avoids clashes with other local Postgres instances). `DATABASE_URL` in `.env.example` already points at `localhost:5433`.

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:5173 |
| API health | http://localhost:3000/health |
| Swagger | http://localhost:3000/api/docs |

Full clone-to-login walkthrough: [docs/17-local-deployment/LOCAL_SETUP.md](docs/17-local-deployment/LOCAL_SETUP.md).

## Docker v1 (API + web images)

Production-style Compose (`postgres` + `sst-api` + `sst-web`):

```bash
cp docker/.env.prod.example docker/.env.prod
docker compose -f docker/docker-compose.prod.yml up -d --build
```

| Service | URL |
|---------|-----|
| Web | http://localhost |
| API health | http://localhost:3000/health |

Build, smoke, `docker save`/`load` handoff, rollback: [docs/17-local-deployment/DEPLOY_V1.md](docs/17-local-deployment/DEPLOY_V1.md).

Admin login is created by `pnpm db:seed` using `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from your `.env` (set these yourself; no default credentials are shipped).

### Email (company SMTP)

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `APP_LOGIN_URL` in `.env` to enable transactional emails (user credentials, TA assignment, HR on select, TA/Sales on join/close). If `SMTP_HOST` is empty, the API skips sending and logs a debug message.

## Design tokens

Palette lives in `apps/web/src/styles/index.css` (`:root` / `.dark`). Change CSS variables to retheme without touching components.
