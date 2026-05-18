# Workhuman Dashboard — Hosted Next.js Version

This is the hosted alternative to the Cowork artifact. Same data, real authentication, refreshable on demand, shareable with your team.

## Architecture

- Next.js 14 (App Router)
- NextAuth (Google OAuth, restricted to @workhuman.com)
- Reuses the existing fetcher modules in `../src/fetchers/` — no data-layer rewrite
- Snapshot-based: API routes read from the `data/snapshot.json` written by the parent Node orchestrator

## Local development setup

```bash
cd web
npm install
cp .env.local.example .env.local
# Fill in NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (see below)
npm run dev
# open http://localhost:3000
```

## Setting up Google OAuth

1. Go to https://console.cloud.google.com/apis/credentials in your existing `marketing-intelligence-490112` project
2. Click **Create Credentials > OAuth client ID**
3. Application type: **Web application**
4. Name: `Workhuman Dashboard (local dev)` (or similar)
5. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (for dev)
   - `https://your-vercel-url.vercel.app/api/auth/callback/google` (after deploy)
6. Copy the Client ID and Client Secret into `.env.local`
7. Generate a NextAuth secret: `openssl rand -base64 32`

## Auth restrictions

By default, only emails ending in `@workhuman.com` can sign in. To extend:

```
ALLOWED_EMAIL_DOMAINS=workhuman.com,workhumanlive.com
```

Anyone outside the allowlist gets a clear error message at the login screen.

## Deploying to Vercel

```bash
npm i -g vercel
cd web
vercel
```

After the first deploy:

1. In the Vercel dashboard, set all env vars from `.env.local.example` (production values)
2. **Important**: `NEXTAUTH_URL` must be your Vercel URL (e.g. `https://workhuman-dashboard.vercel.app`)
3. Add the Vercel URL to the Google OAuth authorized redirect URIs (step 5 above)
4. The service-account JSON path needs to be different in production. Two options:
   - Upload the JSON to Vercel as a file via `vercel env add GOOGLE_APPLICATION_CREDENTIALS_JSON` (paste the JSON contents) and update `lib/google-auth.ts` to write it to a temp file at runtime
   - Or use Workload Identity Federation for keyless GCP auth (more secure, slightly more setup)

## Data refresh

Two options:
- **On-demand**: Click "Refresh data" in the dashboard UI. Triggers `POST /api/refresh` which runs the orchestrator. ~30-60 seconds.
- **Scheduled**: Set up a Vercel Cron Job (`vercel.json`) to hit `/api/refresh` daily at e.g. 6am ET.

## File map

```
web/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   ← NextAuth handler
│   │   ├── refresh/route.ts              ← triggers orchestrator
│   │   └── snapshot/route.ts             ← serves snapshot.json
│   ├── dashboard/page.tsx                ← main dashboard (auth-protected)
│   ├── login/page.tsx                    ← Google sign-in
│   ├── page.tsx                          ← redirects to /dashboard
│   ├── layout.tsx                        ← root layout
│   └── globals.css
├── components/
│   └── DashboardClient.tsx               ← React UI (v1 scaffold)
├── lib/
│   └── auth.ts                           ← NextAuth config + domain restriction
├── middleware.ts                         ← protects /, /dashboard, /api/snapshot
├── package.json
├── next.config.js
├── tsconfig.json
└── .env.local.example
```

## What's in v1 (this scaffold)

- ✓ Auth working (Google OAuth + @workhuman.com domain restriction)
- ✓ Protected routes via middleware
- ✓ Dashboard page that loads snapshot from API
- ✓ "Refresh data" button that triggers the orchestrator
- ✓ Sign-out flow

## What's coming in v1.1

The dashboard UI currently shows a basic snapshot loaded confirmation. The full tab structure (Overview, Web Traffic, Paid Performance, AI Search, Content with drill-down, WHLP) will be ported from the Cowork artifact in v1.1. The data layer is already wired; only the React components need to be written.

Each tab is a straightforward port of the equivalent `render*` function in the Cowork artifact's HTML, expressed as a React component using `react-chartjs-2` for charts. Pattern:

```tsx
// components/tabs/Overview.tsx
'use client';
export function OverviewTab({ snapshot }: { snapshot: Snapshot }) {
  // ... same logic as the artifact's renderOverview()
}
```
