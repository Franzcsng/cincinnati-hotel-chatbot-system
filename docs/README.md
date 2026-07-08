# The Cincinnati Hotel — Documentation

A boutique hotel website with separate guest and admin experiences, plus an
admin-uploaded PDF knowledge base that powers an AI assistant.

This folder is the living documentation for the project. Update the relevant
doc whenever a page, route, table, or env var changes — don't let this drift
from the code.

## Contents

- [setup.md](./setup.md) — prerequisites, install, running the app locally
- [architecture.md](./architecture.md) — tech stack, folder structure, routes, request flows
- [api.md](./api.md) — backend API reference
- [environment-variables.md](./environment-variables.md) — every env var, what it's for, where it's used
- [branding.md](./branding.md) — brand voice, color palettes, typography

## Current status

**Built:**
- Landing page with Guest / Admin selection
- Admin shell (sidebar nav: Dashboard, Upload PDF Document)
- Admin Dashboard — live stats (total chat sessions, questions asked,
  answer rate, questions-by-topic bar breakdown), polling every 8s — see
  [architecture.md](./architecture.md#statistics-flow)
- Admin Upload PDF page — full upload flow wired to the backend, plus the
  currently active document's filename/upload date
- Client page — hero banner + hotel assistant chat widget, fully wired
  end-to-end (session creation, message send, Markdown-rendered assistant
  replies, and a "connect with our team" contact form that appears on
  fallback replies) — see [architecture.md](./architecture.md#chat-flow)
- Backend: `GET /api/documents/active`, `POST /api/documents/upload`,
  `POST /api/chat/sessions`, `POST /api/chat/messages`,
  `POST /api/contact-requests`, `GET /api/stats` (see [api.md](./api.md))

**Explicitly out of scope for now:**
- No authentication/authorization on `/admin` or `/client` routes — anyone can
  navigate there directly. This is intentional for the current build phase.
- No booking/rooms content on the client page yet.

**Note on data ownership:** this app's Express backend never writes to
`messages` or `contact_requests` — both are written directly by their
respective n8n workflows. The backend only reads `messages` (filtered to
`role = 'client'`) for `GET /api/stats`. See
[architecture.md](./architecture.md#database-supabase).
