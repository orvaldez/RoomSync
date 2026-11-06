# Deployment

How RoomSync runs in production, set up for #117. The settings and what they
are for are recorded here, but no secret values. Those live only in Render's
and Neon's settings (`BACKLOG.md`, working rules). How to keep it running is in
the [maintenance and support plan](./maintenance-plan.md), and the risks are in
the [risk register](./risk-register.md).

**Live at https://roomsync-ykvd.onrender.com**, deployed from `main`.
*Last updated: November 4, 2026.*

## 1. What runs where

```
browser ── https://roomsync-ykvd.onrender.com ── Render Static Site "roomsync"
                │                                  client/dist, from client/
                │ /api/*  (rewrite, same origin)
                ▼
          https://roomsync-api-1wjb.onrender.com ─ Render Web Service "roomsync-api"
                                                  server/Dockerfile (#116)
                │ DATABASE_URL (TLS)
                ▼
          Neon project "roomsync" ──────────────── PostgreSQL 16, database roomsync
                                                  AWS US East 2 (Ohio)
```

| Part | Where | Plan | Region |
|---|---|---|---|
| Client | Render Static Site `roomsync` | Free | Render's CDN |
| API | Render Web Service `roomsync-api`, Docker | Free (0.1 CPU, 512 MB) | Ohio (US East) |
| Database | Neon project `roomsync`, branch `production` | Free | AWS US East 2 (Ohio) |

The API and the database are in the same area, so each query stays in Ohio.
Both Render services build from the public repository
`https://github.com/orvaldez/RoomSync`, not through a GitHub connection, so
nothing in Render has access to the repository beyond what anyone has.

## 2. Settings

### The API: `roomsync-api`

| Setting | Value | Why |
|---|---|---|
| Language | Docker | The image from #116 |
| Branch | `main` | |
| Docker Build Context Directory | `server` | |
| Dockerfile Path | `server/Dockerfile` | |
| Docker Command / Pre-Deploy Command | empty | The image's own command runs `prisma migrate deploy`, then the server. Pre-deploy is a paid feature anyway |
| Health Check Path | `/api/health` | It doesn't query the database, so Render's checks don't keep Neon awake |
| Auto-Deploy | **Off** | Until #118 deploys from CI, only after the checks pass |
| Instance type | Free | |

Environment variables:

| Key | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Turns on the secure cookie, HSTS and `trust proxy` (`middleware/session.ts`) |
| `DATABASE_URL` | Neon's **direct** connection string (Connect → connection pooling **off**) | Prisma's migrations need a direct connection rather than a pooled one, and the server keeps its own pool anyway |
| `SESSION_SECRET` | Generated in Render ("Generate") | Never anywhere else. The server refuses the example value in production |
| `TRUST_PROXY_HOPS` | **none: delete it** | Read only between #136 and #PRNUM. The proxies are now trusted by address (§5) |

`PORT` is not set: Render sets it (10000), and the server reads it.

### The client: `roomsync`

| Setting | Value |
|---|---|
| Branch | `main` |
| Root Directory | `client` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |
| Auto-Deploy | **Off**, as for the API |
| Environment | `NODE_VERSION` = `20`, the version CI builds with |

Redirects and rewrites, **in this order**:

| # | Source | Destination | Action | Why |
|---|---|---|---|---|
| 1 | `/api/*` | `https://roomsync-api-1wjb.onrender.com/api/*` | Rewrite | The browser only ever talks to one origin, so the `SameSite=Lax` session cookie works and no CORS is needed, as with Vite's proxy locally |
| 2 | `/*` | `/index.html` | Rewrite | Client-side routes (`/history`, `/join/:token`) load the app. Render skips rules for paths where a real file exists, so `/assets/*` still loads |

### The database: Neon `roomsync`

Postgres 16, database `roomsync`, the default owner role, branch `production`.
No other Neon service (storage, functions, auth) is used.

## 3. Deploying

**Until #118:** in Render, **Manual Deploy → Deploy latest commit**, on
`roomsync-api` first, then on `roomsync`, if the client changed. On start, the
API applies any pending migrations, then listens. A successful API deploy logs
`All migrations have been successfully applied.` (or
`No pending migrations to apply.`) and then
`RoomSync API listening on port 10000`.

**Rolling back:** redeploy the last good commit. On each service, use
**Manual Deploy → Deploy a specific commit**, or the rollback on an earlier
deploy in its **Events** list where the plan offers it. Migrations only ever
add (maintenance plan §5), so older code still runs against a newer schema.

## 4. Free-tier limits, measured

Measured November 4, 2026, from outside with `curl`.

| | What we saw | What it means |
|---|---|---|
| API cold start | **32 s** for the first request after it slept | Render spins a free web service down after 15 min without traffic. **Warm it up before the demo** (§6) |
| API, awake | `/api/health` 0.4 s; a login about 1.1 s | Login is slow on purpose (bcrypt, cost 10) and the instance has 0.1 CPU |
| First query after Neon slept | about 5 s on the first login, then normal | Neon suspends after 5 min idle; the first query also opens the pool |
| Client | No spin-down | Static Sites aren't web services: no cold start, no instance hours |

From the providers' documentation, checked the same day:

| Limit | Render | Neon |
|---|---|---|
| Compute | 750 instance hours per month per workspace; only the API uses them | 100 CU-hours per project per month; compute stops if they run out until the next month |
| Storage | | 1 GB |
| Data out | Render's included bandwidth | 5 GB per month |
| History and backups | No backups on the free tier | 6-hour restore window, 1 manual snapshot |
| Logs | 7 days on the Hobby plan | Monitoring kept 1 day |
| Expiry | None for web services and static sites | **None.** The free plan is permanent |

## 5. The visitor's IP address

The API needs the visitor's real address for the per-IP rate limits (#71) and
the security log (#99). It reads it from `X-Forwarded-For`, skipping the
proxies it trusts. At first (#136) it trusted a number of hops, set by
`TRUST_PROXY_HOPS`. Render's documentation doesn't say how many proxies sit in
front, and its proxy keeps any `X-Forwarded-For` a visitor sends, so the
number was measured.

**How it was measured,** on November 4, 2026: for each value, set it on
`roomsync-api`, send a failed login with a forged header, once through the
site and once straight to the API, and read `"ip"` on the `login_failed` lines
in the API's logs:

```bash
curl -s -H 'Content-Type: application/json' -H 'X-Forwarded-For: 203.0.113.7' \
  -d '{"email":"nobody@example.invalid","password":"x"}' \
  https://roomsync-ykvd.onrender.com/api/auth/login      # or roomsync-api-1wjb…
```

**What it showed:**

| Trusted hops | Straight to the API | Through the site's `/api` |
|---|---|---|
| 1 | Render `10.x` | Render `10.x` |
| 2 | Cloudflare `104.23.x` | Render `10.x` |
| 3 | **the visitor** | Cloudflare `104.23.x` |
| 4 | **`203.0.113.7`, the forged one** | Cloudflare `104.23.x` |
| 5 | | **the visitor** |

Render's services sit behind Cloudflare, and the static site's rewrite runs
on Cloudflare too, so a request through the site crosses Cloudflare and
Render's proxies twice. **No single count works:** 3 leaves the site path on a
Cloudflare address shared by many visitors, and 5 lets anyone calling the API
directly choose their own address.

**The fix (#PRNUM):** trust the proxies by address instead. In production the
server trusts private addresses (Render's `10.x`) and Cloudflare's published
ranges (`server/src/middleware/trusted-proxies.ts`), and takes the first
address from the right that isn't one of them. That is the visitor on both
paths, and a forged entry, which sits to the left of it, is never reached.
`trusted-proxies.test.ts` replays both measured chains.

- **Cloudflare's ranges** are copied from https://www.cloudflare.com/ips-v4
  and https://www.cloudflare.com/ips-v6 (November 6, 2026), and re-checked at
  each milestone (maintenance plan §2).
- **Known gap:** a request sent from inside Cloudflare's network, such as a
  Cloudflare Worker, has a trusted source address, so its own forged header
  would be believed. Accepted for this project.
- **To check after a deploy:** a forged login through the site and one
  straight to the API should both log your own address, never `203.0.113.7`.

## 6. Before the live demo

1. Open https://roomsync-ykvd.onrender.com/api/health at least a minute
   beforehand and wait for `{"status":"ok"}`. That wakes the API and opens its
   database pool.
2. Sign in once as a demo account (§7), so Neon is awake too.
3. If Render is down, the local Docker setup in the README is the fallback
   (#124).

## 7. Demonstration accounts

The seed refuses to run when `NODE_ENV` is `production`, and Render's free
tier has no shell, so the demo household is created **from a laptop, against
Neon, deliberately**:

```bash
cd server
DATABASE_URL='<Neon direct connection string>' npm run db:seed
```

In PowerShell, set it for that window only, and clear it afterwards:

```powershell
cd server
$env:DATABASE_URL = '<Neon direct connection string>'
npm run db:seed
Remove-Item Env:DATABASE_URL
```

- The variable set in the shell wins over `server/.env`, which keeps pointing
  at the local database. **Never write the Neon string into `server/.env`:**
  then `npm run dev` and `prisma migrate reset` on that laptop would act on
  production.
- It creates the same Apartment 41 household and accounts as locally
  (README, Seed data), with the password `roomsync123`. Running it twice is
  safe: it stops if the household is already there.
- **Accepted risk:** that password is public in the README, so anyone can sign
  in as the demo members and change their data. The data is fictional, and the
  TA needs known accounts. Re-running the seed after `prisma migrate reset`
  against Neon restores it; real accounts registered on the site are separate.

**Status:** not run yet. Before the submission (#125).

## 8. Differences from the proposal

The proposal (§7) planned Render for the application and its PostgreSQL. Three
changes, each for a reason found while deploying:

| Planned | Deployed | Why |
|---|---|---|
| Render PostgreSQL | **Neon**, free | Render's free PostgreSQL expires 30 days after it is created. One made on November 4 would have stopped on December 4, possibly during grading. Neon's free plan doesn't expire. The application didn't change: only `DATABASE_URL`. The Render database is no longer used |
| The client as the #116 nginx container | **A Render Static Site** | A second free web service would also sleep, so a cold visit could wait for two wake-ups, and it would share the 750 instance hours. The static site never sleeps. The nginx image is still the local Docker Compose setup the TA can run (README) |
| Deploy on every push | **Auto-deploy off** until #118 | A push to `main` should deploy only after CI passes |
