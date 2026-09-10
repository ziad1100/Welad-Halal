# Welad-Halal — KStore POS / Retail POS / Order Management / ERP

React + TypeScript (Vercel) · NestJS + Prisma + Neon PostgreSQL (Render) · Render Redis · Docker. RTL Arabic legacy-desktop UI.

```text
LOCAL:
  docker compose up -d --build   →  Postgres + Redis + backend (:3001)

PRODUCTION:
  GitHub
    |
    +--> Vercel  →  apps/web  (POS-web, QR order view, display mirror, manager PWA)
    |
    +--> Render  →  apps/backend (NestJS API, cron, WebSockets)
             |
             +--> Neon PostgreSQL  (DATABASE_URL pooled / DIRECT_URL direct)
             |
             +--> Render Redis     (REDIS_URL; barcode cache, realtime alerts)

Electron:
  - desktop installer built per store PC (NOT deployed to Vercel)
  - loads WELAD_WEB_URL (Vercel frontend in prod), syncs offline outbox to Render API
```

## Quick start (local)

Prereqs: Node 22+, Docker Desktop **running**, npm.

```powershell
# 1. env
Copy-Item .env.example .env

# 2. start Postgres + Redis (+ backend container)
docker compose up -d --build

# OR run backend locally:
# docker compose up -d db redis
npm install
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npm run db:seed
npm run dev:backend   # :3001  →  /api/health, /api/docs
npm run dev:web       # :5173 (proxies /api → :3001)
```

> **Rule: after every Prisma migration, rebuild the backend container**
> (`npm run docker:rebuild`, or `GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build backend`).
> The image bakes the compiled JS + Prisma client at build time — `migrate deploy` at container
> start only migrates the schema. Verify with `GET /api/health` (`sha` + `migrationsApplied`).

Demo logins (seeded): `احمد الصياد` (owner, forced password change on first login; bootstrap secret from `OWNER_PASSWORD`, dev fallback only) · `admin/admin123` + `manager/manager123` (manager) · `cashier/cashier123` (employee). Demo passwords are for local/dev only — rotate all immediately in production.

## Critical flows

- POS: `/pos` — barcode/name search, unknown barcode opens Item Data modal prefilled, F2 customers, F9 hold (`HELD`), F12 confirm (`CONFIRMED`).
- Prices are authoritative server-side: frontend `unitPrice` is ignored; `unitPriceSnapshot` preserves history.
- Insufficient stock → `409 الكمية غير متاحة في المخزن`, full transaction rollback.
- Orders Log `/` tabs: سجل الطلبات (confirmed/completed/…) vs الطلبات المعلقة (PENDING/HELD) — all from PostgreSQL.

## Tests

```powershell
npm run test:backend   # needs DATABASE_URL (critical transaction + price-tamper spec in apps/backend/test/critical.spec.ts)
```

## Deploy

- Frontend → Vercel: Root Directory = repository root (empty; `vercel.json` runs `npm run build --workspace apps/web`), `VITE_API_URL=https://<render-backend>/api` (see `vercel.json`, `apps/web/.env.example`).
- Backend → Render: `render.yaml` (build runs `prisma migrate deploy`), set Neon pooled host as `DATABASE_URL` + direct host as `DIRECT_URL`, managed Redis as `REDIS_URL`, `CORS_ORIGIN=https://<vercel-app>`, `NODE_ENV=production`, `JWT_SECRET` (≥32 chars, boot fails without it in prod).
- Auth: `POST /api/auth/login` `{username, password}` → `{token, user}`; forced change via `PATCH /api/auth/password`. Offline order retries send `Idempotency-Key` (replays return the same order).
- Migrations: `prisma migrate deploy` ONLY (never `migrate reset` on shared DBs). New dev migration: `prisma migrate dev` locally, commit the SQL, rebuild backend image.
- Seed (fresh DB, once): set `OWNER_PASSWORD`, run `npm run seed --workspace apps/backend`, rotate all demo passwords immediately.
- Health: `GET /api/health` (`migrationsApplied`, `sha`), `GET /api/health/database`. Docs (`/api/docs`) are dev-only (disabled when `NODE_ENV=production`).
- Env names (values live in dashboards only): `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `OWNER_PASSWORD`, `VITE_API_URL`, `WELAD_WEB_URL`, `WELAD_API_URL`, `PORT`, `NODE_ENV`.

## Structure

```text
apps/web      React POS + Orders Log (RTL, KStore theme in src/styles/kstore.css)
apps/backend  NestJS API (auth/users/products/categories/inventory/customers/orders/purchases/expenses/reports/health)
              prisma/schema.prisma + prisma/migrations + prisma/seed.ts
docker-compose.yml  Postgres + Redis + Backend (persistent pgdata volume)
```
