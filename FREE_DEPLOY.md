# Free deploy: Render + Supabase

Zero monthly cost. Trade-off: the free web service sleeps after 15 min idle
and takes ~30-60s to wake on the next request; Supabase's free database
pauses after 7 days with no activity (one click in the dashboard to resume).

## 1. Create the Supabase project
1. https://supabase.com → New project → pick the region closest to your team
2. Wait for it to finish provisioning (~2 min)

## 2. Get your database connection string
Settings → Database → Connection string → **URI** tab → copy it.
It looks like:
```
postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres
```
Paste it into `backend/.env` as `DATABASE_URL` (replace `[YOUR-PASSWORD]` with
the password you set when creating the project).

## 3. Get your Storage keys
Settings → API → copy:
- **Project URL** → `SUPABASE_URL`
- **service_role** key (not `anon`) → `SUPABASE_SERVICE_ROLE_KEY`

Paste both into `backend/.env`.

## 4. Create the storage bucket
Storage → New bucket → name it `documents` → **uncheck** "Public bucket"
(keep it private — the backend hands out short-lived signed URLs instead).

## 5. Install new dependencies locally
```bash
cd backend
npm install
```

## 6. Migrate your existing sqlite data
```bash
npm run migrate:to-supabase
```
This copies every row from `data/clickormedia.sqlite` into Supabase. It's
safe to re-run if it fails partway through. Your local sqlite file is only
read, never modified.

Spot-check in Supabase's Table Editor afterward — confirm you see 6 employees,
114 attendance rows, etc.

## 7. Deploy the backend to Render
1. Push this repo to GitHub if it isn't already
2. https://render.com → New → Blueprint → connect the repo → Render reads
   `render.yaml` automatically
3. It will ask you to fill in the env vars marked `sync: false`:
   `JWT_SECRET`, `BIOMETRIC_WEBHOOK_SECRET`, `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` — paste in the same values from your `.env`
4. Deploy. Render gives you a URL like `https://clickor-media-backend.onrender.com`

## 8. Point the mobile app and biometric agent at it
- `mobile-app/.env`: set `EXPO_PUBLIC_API_BASE_URL` to your real Render URL + `/api`
- `backend/.env` (for the biometric agent running on your office LAN machine):
  set `API_BASE_URL` to the same Render URL + `/api`

## 9. Verify
```bash
curl https://<your-app>.onrender.com/api/health
```
First request after idle will be slow (cold start) — that's expected on the
free tier, not a bug.
