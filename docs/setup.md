# Setup

## Prerequisites

- Node.js 20.19+ or 22.12+ recommended (see note below if you're on an older 20.x)
- npm
- A Supabase project with:
  - a `documents` table and `document_chunks` table (see [architecture.md](./architecture.md#database-supabase))
  - a storage bucket for PDF uploads

## Install

```bash
cd frontend && npm install
cd ../server && npm install
```

## Environment variables

Copy the variable names from [environment-variables.md](./environment-variables.md)
into:

- `server/.env.local`
- `frontend/.env.local`

Both files are gitignored (`*.local`) — never commit real values.

## Run locally

Two processes, in separate terminals:

```bash
# Backend — http://localhost:4000
cd server
npm run dev

# Frontend — http://localhost:5173
cd frontend
npm run dev
```

Visit `http://localhost:5173`.

## Node version note

If `npm run build` in `frontend/` fails with a `rolldown-binding` /
`MODULE_NOT_FOUND` error, it's because Vite 8's default bundler (Rolldown)
needs Node ≥20.19. The project currently pins `vite`/`@vitejs/plugin-react`
to the v7 line specifically to stay compatible with older Node 20.x. If the
whole team moves to Node ≥20.19, this pin can be removed.

If the backend crashes on startup with `Node.js 20 detected without native
WebSocket support`, it means the `ws` dependency (used as the Supabase
realtime transport) is missing — run `npm install` again in `server/`.
