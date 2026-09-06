# Deploy — Render (backend + Postgres) + Vercel (frontend)

Repo: `https://github.com/ziad1100/Welad-Halal.git`, branch `main`. All config files are committed
(`render.yaml`, `vercel.json`, `docker-compose.yml`, `apps/backend/Dockerfile`).

## 1. Render — PostgreSQL

1. Dashboard → **New +** → **PostgreSQL**. Name: `kstore-postgres`, region closest to you.
2. Copy the **Internal Database URL** (starts with `postgresql://...`) — backend uses the internal URL.
3. No further setup; migrations run automatically on each backend deploy.

## 2. Render — Backend (Node Web Service)

1. **New +** → **Web Service** → connect the `Welad-Halal` repo. Render detects `render.yaml`.
2. Settings (if not auto-filled): Root Directory `apps/backend`,
   Build `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`,
   Start `node dist/src/main.js`, Health Check Path `/api/health`.
3. Environment variables:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Internal URL from step 1 |
   | `JWT_SECRET` | long random string (≥32 chars) — never reuse dev secret |
   | `JWT_EXPIRES_IN` | `8h` |
   | `CORS_ORIGIN` | `https://<your-vercel-app>.vercel.app` (exact, no trailing slash) |
   | `REDIS_URL` | leave empty (reserved; backend works without it) |
   | `PORT` | `3001` (Render injects its own `PORT`; app respects `process.env.PORT`) |
4. Deploy → verify: `https://<service>.onrender.com/api/health` → `{"status":"ok",...}`,
   `/api/health/database` → `connected`, `/api/docs` → Swagger.
5. Seed demo data **once** (Render Shell tab):
   `npm run seed --workspace apps/backend` — logins `owner@weladhalal.pos` (owner, forced password change on first login),
   `admin/admin123` + `manager/manager123` (manager), `cashier/cashier123` (employee).
   The migration already inserts the owner row; set `OWNER_PASSWORD` env before seeding to choose a different
   bootstrap secret. Rotate ALL demo passwords immediately (owner: login → forced change screen).

## 3. Vercel — Frontend

1. **Add New Project** → import `Welad-Halal`. Root Directory: `apps/web`, Framework: Vite
   (auto from `vercel.json`; output `apps/web/dist`).
2. Environment variable: `VITE_API_URL=https://<render-service>.onrender.com/api`
3. Deploy → open the URL, login as cashier, create + confirm an order.
4. Back in Render, set `CORS_ORIGIN` to the real Vercel URL and redeploy backend
   (until then the API rejects browser calls from the new origin).

## 4. Production acceptance (spec §77, run against live URLs)

1. Login each role; cashier must get 403 on `/api/users`, `/api/reports/*`, `/api/audit`.
2. New order → add item → F12 → total equals DB price × qty; order visible in Orders Log with snapshot prices.
3. Change price as admin → new order uses new price, old order keeps old price.
4. Unknown barcode → Item Data modal opens prefilled → save → product searchable.
5. F9 hold → restart browser → held order still under Pending → confirm → stock deducted + `SALE` movement in Inventory → Movements.

## Notes

- Never commit `.env` files; production secrets live only in dashboards.
- Each Render deploy re-runs `prisma migrate deploy` — safe (applies only new migrations).
- Free-tier Render services sleep on idle: first request may take ~60s (health check warms it).
