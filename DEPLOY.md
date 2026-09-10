# Deploy — Neon (Postgres) + Render (backend + Redis) + Vercel (frontend)

Repo: `https://github.com/ziad1100/Welad-Halal.git`, branch `main`. All config files are committed
(`render.yaml`, `vercel.json`, `docker-compose.yml`, `apps/backend/Dockerfile`).

> Database lives on **Neon**, not Render — `render.yaml` intentionally contains no
> `databases:` stanza so no redundant Postgres can be accidentally provisioned.

## 0. Pre-deploy repo gate (run locally, all must pass)

1. Working tree committed and pushed to `main` (deploy sources are Git-based).
2. `npx prisma validate --schema apps/backend/prisma/schema.prisma`
3. `npx tsc --noEmit -p apps/backend` and `npx tsc -b apps/web`
4. `npm run test:backend` (51 tests) · `npx vitest run` in `apps/web` (27 tests) · `npm run test --workspace apps/desktop` (3 tests)
5. `npm run build --workspace apps/web` succeeds; backend `docker build ./apps/backend` succeeds.
6. Confirm `render.yaml` has no `databases:` stanza and `DIRECT_URL` is set on Render
   (missing `DIRECT_URL` fails the build at `migrate deploy`).

## 1. Neon — PostgreSQL (production + dev branch)

1. Create project `welad-halal-pos` with a production database and a separate
   development branch for migration dry-runs.
2. Copy **two** connection strings for production:
   - **Pooled** (`-pooler` host) → Render `DATABASE_URL` (application runtime).
   - **Direct** (non-pooler host) → Render `DIRECT_URL` (only `prisma migrate deploy`,
     which needs a direct connection and fails on transaction-mode poolers).
   Never reuse the pooled string for migrations.
3. No further setup; migrations run automatically on each backend deploy.

## 2. Render — Backend (Node Web Service)

1. **New +** → **Web Service** → connect the `Welad-Halal` repo. Render detects `render.yaml`.
2. Settings (if not auto-filled): Root Directory `apps/backend`,
   Build `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`,
   Start `node dist/src/main.js`, Health Check Path `/api/health`.
3. Environment variables:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Runtime connection: **Neon pooled (`-pooler`) host** (local Docker/CI: same value as `DIRECT_URL`) |
   | `DIRECT_URL` | Migrations-only connection (`prisma migrate deploy` runs in build): **Neon direct (non-pooler) host** — migrations use advisory locks and fail on transaction-mode poolers (local Docker/CI: same value as `DATABASE_URL`) |
   | `JWT_SECRET` | long random string (≥32 chars) — never reuse dev secret |
   | `JWT_EXPIRES_IN` | `8h` |
   | `CORS_ORIGIN` | `https://<your-vercel-app>.vercel.app` (exact, no trailing slash) |
   | `REDIS_URL` | Render managed Redis connection string (**required** — do not rely on the in-memory fallback in production) |
   | `OWNER_PASSWORD` | Owner bootstrap secret — **must be set before the first (and only) seed**; seed refuses production without it |
   | `PORT` | `3001` (Render injects its own `PORT`; app respects `process.env.PORT`) |
4. Deploy → verify: `https://<service>.onrender.com/api/health` → `{"status":"ok",...}`,
   `/api/health/database` → `connected`, `/api/docs` → Swagger.
5. Seed **once** against the fresh Neon DB (Render Shell tab, repo root):
   `npm run seed --workspace apps/backend` — creates Owner `احمد الصياد`
   (`username` احمد الصياد, `isOwner`, owner/100, `forcePasswordChange=true`) plus demo
   logins `admin/admin123` + `manager/manager123` (manager), `cashier/cashier123` (employee).
   The seed only (re)sets the Owner password while `forcePasswordChange=true`, so re-running
   never clobbers a rotated password. **Immediately after seeding: log in as Owner and complete
   the forced password change, then rotate ALL demo passwords.** Never commit `OWNER_PASSWORD`
   or any credential to the repo — dashboard only.
6. Verify the owner row directly (read-only; table is `"User"`, columns are
   `snake_case` — `"isOwner"` / `"permissionLevel"` do NOT exist):
   ```sql
   SELECT id, username, role, "is_owner", "is_active", "permission_level"
   FROM "User" WHERE username = 'احمد الصياد';
   ```
   Expected: exactly one row, role=owner, `is_owner`=true, `is_active`=true,
   `permission_level`=100. (Faster alternative covering the same ground:
   `npm run seed:status --workspace apps/backend` — read-only, no secrets printed.)

## 3. Vercel — Frontend

1. **Add New Project** → import `Welad-Halal`. **Root Directory: repository root (empty)** —
   `vercel.json` already encodes `buildCommand: npm run build --workspace apps/web` and
   `outputDirectory: apps/web/dist`, which only resolve from the repo root.
   Do NOT set Root Directory to `apps/web` (that breaks `--workspace` with
   `No workspaces found`). Framework: Vite (auto).
2. Environment variable: `VITE_API_URL=https://<render-service>.onrender.com/api`
3. Deploy → open the URL, login as cashier, create + confirm an order.
4. Back in Render, set `CORS_ORIGIN` to the real Vercel URL and redeploy backend
   (until then the API rejects browser calls from the new origin).

## 4. Production acceptance (spec §77, run against live URLs)

1. Login each role (`POST /api/auth/login`); cashier must get 403 on `/api/users`, `/api/reports/*`, `/api/audit`.
2. New order → add item → F12 → total equals DB price × qty; order visible in Orders Log with snapshot prices.
3. Change price as admin → new order uses new price, old order keeps old price.
4. Unknown barcode → Item Data modal opens prefilled → save → product searchable.
5. F9 hold → restart browser → held order still under Pending → confirm → stock deducted + `SALE` movement in Inventory → Movements.
6. Offline outbox (Electron): disconnect network → confirm order → "طابور المزامنة" badge appears → reconnect → order syncs once (no duplicate; retry with the same `Idempotency-Key` replays the same order).
7. Average cost: purchase the same product at two prices → `Product.purchasePrice` equals the quantity-weighted average.

## 5. Electron desktop (per store PC — installer, never Vercel)

1. Set `WELAD_WEB_URL=https://<your-vercel-app>.vercel.app` (frontend origin) and
   `WELAD_API_URL=https://<render-service>.onrender.com/api` (sync target) when packaging.
2. `npm install --workspace apps/desktop`, then `npm run rebuild --workspace apps/desktop`
   (compiles better-sqlite3 for Electron), then package with electron-builder.
3. Offline queue lives in the OS user-data dir (`welad-outbox.db`); dead-letter rows are
   inspectable from the POS sync badge flow and never auto-retried.

## 6. Secret rotation (if any credential is ever exposed)

1. Generate the replacement in the owning dashboard (Neon / Render) — never paste secrets into chat, code, or docs.
2. Update the single Render/Vercel variable, redeploy the affected service.
3. Re-verify `/api/health`, `/api/health/database`, and one login per role before closing out.

## Notes

- Never commit `.env` files; production secrets live only in dashboards.
- Each Render deploy re-runs `prisma migrate deploy` — safe (applies only new migrations).
- Free-tier Render services sleep on idle: first request may take ~60s (health check warms it).
