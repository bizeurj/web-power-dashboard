# Workhuman Dashboard — Deployment Walkthrough

Get the dashboard live at `https://workhuman-dashboard.vercel.app` behind
Google SSO with automated daily 6am ET data refresh. End-to-end, this is
about 30 minutes of clicks once you have the prerequisites.

## What you need before starting

- A GitHub account (free is fine) you can push this repo to
- A Vercel account (free Hobby plan is fine) linked to that GitHub
- Access to the Workhuman Google Cloud project where the service account lives
- The existing `.env` file from your local install (for the data-source secrets)
- A Workhuman Google account (the email you'll sign in with)

## 1. Push the repo to GitHub

```bash
cd "/Users/jbizeur/Projects/Data Dashboard/Web Dashboard"
git init
git add .
git commit -m "Initial commit: deployment-ready dashboard"

# Create a NEW PRIVATE repo at https://github.com/new
# Name it something like: workhuman-dashboard
# Do NOT initialize with README / .gitignore / license

git remote add origin git@github.com:YOUR-USERNAME/workhuman-dashboard.git
git branch -M main
git push -u origin main
```

The `.gitignore` already excludes `.env`, `credentials/`, `node_modules/`,
and snapshot files so no secrets get committed. Verify by running
`git status` before pushing.

## 2. Create the Vercel project

1. Go to https://vercel.com/new
2. Import the `workhuman-dashboard` repo you just pushed
3. **Important**: set the **Root Directory** to `web` (not the repo root).
   The Next.js app lives in `/web`; the parent folder is the data-fetcher
   monorepo.
4. Framework Preset: Next.js (auto-detected)
5. Click **Deploy**. The first deploy will fail because env vars aren't
   set yet. That's expected. We'll fix it in step 4.

## 3. Add Vercel Blob storage

1. In your Vercel project → **Storage** tab → **Create Database** → **Blob**
2. Name: `workhuman-dashboard-snapshots`
3. Connect it to your project. Vercel auto-injects `BLOB_READ_WRITE_TOKEN`
   into your env vars. No manual copying needed.

## 4. Set the rest of the environment variables

Go to **Settings → Environment Variables** in your Vercel project. Add
each of the following for **Production** (and **Preview** if you want
preview branches to work too):

### Auth

| Variable | Value |
|---|---|
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` and paste the output |
| `NEXTAUTH_URL` | Your Vercel URL, e.g. `https://workhuman-dashboard.vercel.app` |
| `GOOGLE_CLIENT_ID` | (from step 5 below) |
| `GOOGLE_CLIENT_SECRET` | (from step 5 below) |
| `ALLOWED_EMAIL_DOMAINS` | `workhuman.com` (or add more, comma-separated) |

### Cron auth

| Variable | Value |
|---|---|
| `CRON_SECRET` | Run `openssl rand -hex 32` and paste the output |

### Google service account (GA4 + GSC)

The local `.env` uses `GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json`
(a file path). That won't work on Vercel. Instead:

```bash
# From your local machine, base64-encode the service-account JSON:
base64 -i "/Users/jbizeur/Projects/Data Dashboard/Web Dashboard/credentials/service-account.json" | pbcopy
```

| Variable | Value |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Paste the base64 string from your clipboard |

Leave `GOOGLE_APPLICATION_CREDENTIALS` (the path version) **unset** on
Vercel. The app auto-detects which mode to use.

### Data sources

Copy these from your local `.env` into Vercel:

| Variable | Notes |
|---|---|
| `GA4_PROPERTY_ID_WORKHUMAN_COM` | numeric only, no `properties/` prefix |
| `GA4_PROPERTY_ID_WORKHUMAN_LIVE` | numeric only |
| `PROFOUND_API_KEY` | from app.tryprofound.com → API Keys |
| `PROFOUND_DOMAINS` | e.g. `workhuman.com` |
| `GSC_SITE_URL` | e.g. `sc-domain:workhuman.com` |
| `INCLUDE_HOSTNAMES` | e.g. `www.workhuman.com,workhuman.com,press.workhuman.com` |
| `WHLP_HOSTNAMES` | e.g. `whlp.workhuman.com` |
| `KPI_LOOKBACK_DAYS` | `30` |
| `EXCLUDE_PATH_PREFIXES` | `/speakers,/agenda,/forum,/events` |

## 5. Create the Google OAuth client

1. Go to https://console.cloud.google.com/apis/credentials
2. Project: `marketing-intelligence-490112` (or whichever project owns the
   GA4 service account)
3. **Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. Name: `Workhuman Dashboard (Production)`
6. **Authorized JavaScript origins**: `https://workhuman-dashboard.vercel.app`
7. **Authorized redirect URIs**: `https://workhuman-dashboard.vercel.app/api/auth/callback/google`
8. Create. Copy the Client ID and Client Secret back into Vercel as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (step 4).
9. If the OAuth consent screen isn't already configured for Internal use,
   set it to **Internal** so only Workhuman Workspace accounts can use it.

## 6. Trigger a deploy

In Vercel: **Deployments → ⋯ on the latest failed deploy → Redeploy**.
With env vars now set, the build will succeed.

## 7. Run the first manual refresh

The dashboard will load with "No snapshot found" because the cron hasn't
fired yet. Two ways to seed it:

**Option A — sign in and click Refresh** (slowest, runs in your browser):
1. Visit your Vercel URL, sign in with your @workhuman.com Google account
2. Click **Refresh data**. The button spins for 30-60 seconds while it
   pulls from GA4, GSC, and Profound, then writes to Blob.

**Option B — hit the cron endpoint manually with curl** (faster, no UI):
```bash
curl -X POST https://workhuman-dashboard.vercel.app/api/refresh \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HERE"
```

Either way, after it completes, the dashboard renders the fresh snapshot.

## 8. Confirm the daily cron is scheduled

In Vercel: **Settings → Cron Jobs**. You should see:

```
/api/refresh    0 10 * * *    Daily
```

That's 10:00 UTC, which is 6am EDT (summer) or 5am EST (winter). Vercel
Cron runs in UTC and does not auto-adjust for DST. If you want strict 6am
local year-round, change the schedule to `0 11 * * *` in winter or
keep it at 10 UTC and accept the one-hour shift. Honestly, either is
fine — the dashboard will be ready before your first morning meeting
either way.

## 9. Verify end-to-end

Checklist:

- [ ] Sign-in flow: visit URL, click Sign in with Google, get redirected to dashboard
- [ ] Domain restriction: try signing in with a non-workhuman.com Google account, should see error
- [ ] Snapshot loads: dashboard shows last refresh timestamp
- [ ] Refresh button works: click it, wait 30-60s, see new timestamp
- [ ] Cron is scheduled: visible in Settings → Cron Jobs
- [ ] Cron auth works: cron logs (Settings → Cron Jobs → click the job) show 200 responses

## Common issues

**"Configuration error" on sign-in**
`NEXTAUTH_URL` must exactly match your deployed URL (including https://,
no trailing slash). And `NEXTAUTH_SECRET` must be set.

**"Refresh failed" with GA4 error**
The service-account JSON wasn't decoded properly. Re-base64 the file and
re-paste into Vercel. On macOS use `base64 -i path/to/file` (NOT just
`base64 path/to/file` — that reads from stdin).

**"Refresh failed" with timeout**
Default Vercel Hobby function timeout is 60s. The fetchers usually finish
in 20-40s but a slow Profound call can blow past it. If this happens
repeatedly, upgrade to Pro ($20/month) and bump `maxDuration` in
`app/api/refresh/route.ts` from 60 to 300.

**Snapshot 404 even after refresh**
Confirm the Blob store is connected to the project (Storage tab). The
`BLOB_READ_WRITE_TOKEN` must be present in Vercel env vars (auto-injected
when you create the store).

**Local TypeScript errors about missing next/server types**
Cosmetic. The Vercel build does a clean `npm install` and resolves them.
If they bother you locally, run `rm -rf web/node_modules && cd web && npm install`.

## Going to a custom domain

Once the vercel.app URL is stable and you've validated everything:

1. In Vercel: **Settings → Domains → Add** → `dashboard.workhuman.com`
2. Vercel shows you the DNS records (CNAME) to add — send those to
   whoever runs Workhuman DNS (likely IT or your registrar)
3. After DNS propagates, update `NEXTAUTH_URL` in Vercel to the new URL
4. Add the new URL to the Google OAuth authorized origins + redirect URI
5. Redeploy

## Cost ballpark

- Vercel Hobby: free (you'll fit comfortably)
- Vercel Blob free tier: 1 GB storage, 1 GB egress/month — years of daily snapshots fit
- Total: $0/month until you outgrow Hobby (mostly a question of how many users hit it)
