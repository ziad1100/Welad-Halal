# Version 1 — KStore POS/ERP

Snapshot of everything completed through commit `0484d8f`
(`Add audit API, delivery reps endpoint, Purchases/Categories/Expenses/Audit UI, expanded API tests, DEPLOY.md`).
Repo: `https://github.com/ziad1100/Welad-Halal.git`, branch `main`.

## 1. Architecture

Monorepo (npm workspaces):

- `apps/web` — React 19 + TypeScript + Vite, RTL Arabic interface in the legacy KStore desktop style (sharp corners, dense tables, `Tahoma`, theme vars in `src/styles/kstore.css`). State: Zustand (auth/cart) + TanStack Query (server data).
- `apps/backend` — NestJS 11 + Prisma 6 + PostgreSQL 16, JWT auth + role guards, Swagger at `/api/docs`.
- `docker-compose.yml` — `db` (Postgres 16, persistent `pgdata` volume) + `redis` (reserved) + `backend` (auto-runs `prisma migrate deploy` on start).
- 97 tracked files, deployment configs committed: `vercel.json`, `render.yaml`, `apps/backend/Dockerfile`, `.env.example`, `DEPLOY.md`.

## 2. Database (`0001_init`, 14 tables, verified live)

Users (`ADMIN`/`MANAGER`/`CASHIER`, bcrypt hashes) · Categories · Products (+ `ProductPrice` history) · Inventory · StockMovements (`SALE`/`PURCHASE`/`RETURN`/`ADJUSTMENT`/`OPENING_BALANCE`) · Customers · Orders (+ `OrderItem`s with **name/price snapshots**) · PurchaseOrders/Items · Expenses · AuditLogs. Money as `Decimal(12,2)`, foreign keys, unique constraints (`username`, `barcode`, `sku`, `orderNumber`), indexes on hot paths.

Seed (`prisma/seed.ts`, upsert-safe): 3 users, 6 Arabic categories, 8 products with inventory + opening movements, cash customer + 2 sample customers.
Demo logins: `admin/admin123`, `manager/manager123`, `cashier/cashier123`.

## 3. Backend API

Auth (login/me, 8h JWT) · Users (+ `GET /users/reps` for all roles, `?role=` filter for admin) · Categories · Products (search, `GET /products/barcode/:barcode`, price-history on update) · Inventory (list, low-stock filter, adjust/set with movements) · Customers · Orders (`POST /orders`, `/hold`, `/confirm`, `/cancel`, `/return` — all transactional) · Purchases (receiving increases stock) · Expenses · Reports (sales / top products / inventory / daily incl. net) · Audit listing (admin/manager) · `GET /api/health` + `/api/health/database`.

Order rules enforced server-side: frontend `unitPrice` **ignored** (DB price authoritative), insufficient stock → `409 الكمية غير متاحة في المخزن` with full rollback, `HELD`/`PENDING` persist without deducting stock, cancel/return restore it, old orders keep historical snapshot prices.

## 4. Frontend screens

Login · Orders Log (log/pending tabs, type + delivery-rep filters backed by real data, detail modal with confirm/cancel/print) · POS (barcode/name search, unknown barcode opens prefilled Item Data modal, cart with quantity editing, green totals panel, F2 customers / F9 hold / F12 confirm / ESC close) · Products · Categories · Inventory (+ movements) · Purchases · Expenses · Reports · Audit · Users (admin-only, others see an unauthorized notice).

## 5. Verification evidence (all executed, green)

- `tsc` + `vite build` (web) and `nest build` (backend) pass.
- **12/12 jest tests pass**: `test/critical.spec.ts` (price-tamper ignored, stock 10→8, snapshot preserved after 100→120 repricing, failed-order rollback) + `test/api.spec.ts` (invalid login 401, no-token 401, cashier 403 on users/reports/audit, reps readable, product create→barcode→duplicate-409, inventory adjust→movement, hold-no-deduction→confirm-deduct→cancel-restore lifecycle). Both suites self-clean: **0 test rows residue**.
- Live smoke test against Docker Postgres: health ok, DB connected, cashier login direct + via Vite proxy, tampered order charged DB price with `SALE` movement, cancel restored stock.
- Bugfixes found by testing and fixed: (1) `migration.sql` was UTF-16 (PowerShell redirect artifact) → re-encoded UTF-8 after `P3018/embedded null`; (2) backend never loaded `.env` → added `dotenv` + `import 'dotenv/config'` in `main.ts` (no-op on Render/Docker).

## 6. Deployment readiness

`DEPLOY.md` holds the exact Render (Postgres + Web Service, env table) and Vercel (root `apps/web`, `VITE_API_URL`) steps plus the production acceptance checklist. Local trio verified healthy: `kstore-postgres`, `kstore-redis`, `kstore-backend`. No secrets committed (`.env` git-ignored; only `.env.example` tracked).

## 7. Explicitly NOT in v1 (deferred)

Cloud dashboard clicks (Render/Vercel) · Suppliers module · Manufacturing menu (stub) · Electron shell + thermal-printer/cash-drawer hardware (currently `window.print()`) · Redis usage (container runs, backend doesn't connect — optional per spec) · hardening (rate limiting, security headers, refresh-token rotation, CI pipeline).
