# Environment Variables

Real values live only in the gitignored `.env.local` files
(`server/.env.local`, `frontend/.env.local`) — never commit them. This doc
tracks the *names* and their purpose so the project stays reproducible.

## `server/.env.local`

| Variable | Purpose |
|---|---|
| `PORT` | Port the Express server listens on. Optional, defaults to `4000`. |
| `PDF_UPLOAD_WEBHOOK_URL` | n8n webhook hit after a successful PDF upload; triggers chunking/embedding. |
| `CHAT_WEBHOOK_URL` | n8n webhook hit on every chat message; returns the assistant's reply. |
| `CONTACT_REQUEST_WEBHOOK_URL` | n8n webhook hit when a guest submits the "connect with our team" contact form. **Placeholder — not yet set to a real workflow URL**, so `POST /api/contact-requests` currently 500s until it's configured. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key. Not currently used by the backend, kept for parity/future use. |
| `SUPABASE_SECRET_KEY` | Supabase service-role key — used server-side for Storage and DB writes that bypass RLS. **Backend only, never expose to the frontend.** |
| `SUPABASE_JWKS_URL` | JWKS endpoint for verifying Supabase auth tokens. Not used yet (no auth implemented). |
| `SUPABASE_STORAGE_BUCKET_NAME` | Storage bucket that PDF uploads are written to. |

## `frontend/.env.local`

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL of the backend API (e.g. `http://localhost:4000`). Only `VITE_`-prefixed vars are exposed to browser code by Vite — never put secret keys here. |

## Rule of thumb

- Anything the **backend** needs to talk to Supabase/n8n with elevated
  privileges belongs in `server/.env.local` only.
- The **frontend** should only ever hold public, non-secret values
  (`VITE_`-prefixed). If a frontend env var isn't meant to be visible in
  the browser's network/JS, it doesn't belong in `frontend/.env.local`.
