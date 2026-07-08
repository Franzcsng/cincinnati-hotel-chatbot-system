# Deployment

Two separate services, deployed independently, both auto-deploying from
`main`:

| Layer | Platform | URL |
|---|---|---|
| Frontend (Vite static build) | Vercel | `https://cincinnati-hotel-chatbot-system.vercel.app` |
| Backend (Express, persistent process) | Railway | `https://cincinnati-hotel-chatbot-system-production.up.railway.app` (Railway's auto-generated domain) |

Both are connected directly to the GitHub repo — pushing to `main`
triggers a new build/deploy on both platforms independently, with no
coordination between them.

## Why two platforms instead of one

Vercel doesn't run persistent Node processes — it's built around
serverless functions with a request body size cap (~4.5MB on typical
plans), which would break the PDF upload feature (`POST
/api/documents/upload` allows up to 20MB — see
[api.md](./api.md#post-apidocumentsupload)). Railway runs the Express
app as a normal long-lived process instead, so no such limit. Splitting
frontend/backend across two platforms is the tradeoff for that.

## Backend — Railway

**Root Directory:** `/server` — required, since this repo has `frontend/`
and `server/` as siblings and Railway needs to know which one has the
`package.json` to build.

**Build/start:** auto-detected via Nixpacks — no `Procfile` or
`railway.json` needed. It runs `npm install` then `npm start`, which
resolves to `node index.js` (see `server/package.json`). No `engines`
field is set, so Railway uses its default Node image; nothing in the
codebase is version-sensitive enough for this to matter (the `ws`
package covers the WebSocket gap regardless of Node version — see
[architecture.md](./architecture.md)).

**Domain:** Railway's auto-generated domain (Settings → Networking →
Generate Domain), not a custom domain.

**Environment variables:** every variable listed under `server/.env.local`
in [environment-variables.md](./environment-variables.md) must be set in
Railway's dashboard (Variables tab → Raw Editor is fastest) — Railway
does **not** read `.env.local`, since that file is gitignored and never
reaches the deployed environment. `PORT` is the one exception: don't set
it manually, Railway injects its own and `index.js` already reads
`process.env.PORT || 4000`.

One variable exists specifically *because* this is deployed: `FRONTEND_URL`
must be set to the exact Vercel URL, or the deployed frontend's requests
get rejected by CORS (`server/index.js` only allows `http://localhost:5173`
plus whatever `FRONTEND_URL` is set to — see
[architecture.md](./architecture.md) and the CORS section below).

## Frontend — Vercel

**Root Directory:** `frontend` — same reasoning as Railway's root
directory setting.

**Framework preset:** Vite, auto-detected. Build command, output
directory (`dist`), and install command all use Vercel's Vite defaults —
no overrides needed. No other project settings were changed from
Vercel's defaults (no custom domain, default production branch).

**Environment variable:** `VITE_API_BASE_URL` must be set to the full
Railway URL **including the `https://` scheme** —
`https://cincinnati-hotel-chatbot-system-production.up.railway.app`, no
trailing slash. A bare hostname without the scheme gets treated as a
relative path by the browser instead of an absolute URL, silently
resolving requests against Vercel's own domain instead of Railway's —
this actually happened during initial deployment (requests 404/405'd
against Vercel's static file server) and was the first real deploy bug
hit.

**Critical gotcha — env var changes require a redeploy.** Vite bakes
`VITE_`-prefixed env vars into the JS bundle at *build time*, not
runtime. Editing `VITE_API_BASE_URL` in the Vercel dashboard does nothing
to an already-built deployment — a new build has to run for the change
to take effect (push a commit, or use Vercel's Redeploy button).

**SPA routing fix — `frontend/vercel.json`:**
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
This app uses `react-router-dom`'s `BrowserRouter` (client-side routing)
for `/admin`, `/admin/upload`, `/client`. Without this rewrite, Vercel's
static file server 404s on a direct link or page refresh to any of those
routes — it only works by accident when navigating there via client-side
`Link` clicks from a page that already loaded `index.html`. This file
must live inside `frontend/` (not the repo root) since that's the
configured Root Directory.

## CORS

`server/index.js` restricts `cors()` to an explicit allow-list rather
than accepting any origin:
```js
const allowedOrigins = ['http://localhost:5173', process.env.FRONTEND_URL].filter(Boolean)
app.use(cors({ origin: allowedOrigins }))
```
`http://localhost:5173` is always allowed (local dev); the deployed
frontend is only allowed if `FRONTEND_URL` is correctly set in Railway.
Verified locally by sending requests with different `Origin` headers and
confirming the allowed ones get `Access-Control-Allow-Origin` echoed back
and an unrecognized origin gets nothing.

## Verifying a deployment

After either platform redeploys:
- `GET https://<railway-domain>/health` → `{"status":"ok"}`
- `GET https://<railway-domain>/api/documents/active` → read-only,
  confirms Supabase credentials made it into Railway's env correctly
- On the live Vercel site: send a chat message, refresh while on
  `/admin/upload` (confirms the SPA rewrite), check the dashboard stats
  load — and check the Network tab request URL is actually going to the
  Railway domain, not back to Vercel's own origin

## Known limitation

No staging/preview environment distinction is configured — every push to
`main` deploys straight to production on both platforms. Fine for this
project's current scope (a graded assignment, not a live product), but
worth knowing if this ever needs a safer rollout process.
