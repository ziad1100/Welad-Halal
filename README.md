# Welad-Halal — KStore POS / Retail POS / Order Management / ERP

React + TypeScript (Vercel) · NestJS + Prisma + PostgreSQL (Render) · Redis · Docker. RTL Arabic legacy-desktop UI.

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

Demo logins (seeded): `admin/admin123` (ADMIN) · `manager/manager123` (MANAGER) · `cashier/cashier123` (CASHIER).

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

- Frontend → Vercel: root `apps/web`, `VITE_API_URL=https://<render-backend>/api` (see `vercel.json`, `apps/web/.env.example`).
- Backend → Render: `render.yaml` (build runs `prisma migrate deploy`), attach Render Postgres as `DATABASE_URL`, set `CORS_ORIGIN=https://<vercel-app>`.
- Health: `GET /api/health`, `GET /api/health/database`. Docs: `/api/docs`.

## Structure

```text
apps/web      React POS + Orders Log (RTL, KStore theme in src/styles/kstore.css)
apps/backend  NestJS API (auth/users/products/categories/inventory/customers/orders/purchases/expenses/reports/health)
              prisma/schema.prisma + prisma/migrations + prisma/seed.ts
docker-compose.yml  Postgres + Redis + Backend (persistent pgdata volume)
```
