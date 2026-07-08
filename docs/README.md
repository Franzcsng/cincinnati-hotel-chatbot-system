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
- Admin Dashboard — placeholder only
- Admin Upload PDF page — full upload flow wired to the backend
- Client page — hero banner + hotel assistant chat widget, fully wired
  end-to-end (session creation, message send, Markdown-rendered assistant
  replies, and a "connect with our team" contact form that appears on
  fallback replies) — see [architecture.md](./architecture.md#chat-flow)
- Backend: `POST /api/documents/upload`, `POST /api/chat/sessions`,
  `POST /api/chat/messages`, `POST /api/contact-requests` (see [api.md](./api.md))

**Explicitly out of scope for now:**
- No authentication/authorization on `/admin` or `/client` routes — anyone can
  navigate there directly. This is intentional for the current build phase.
- No booking/rooms content on the client page yet.
- No admin dashboard content yet.
- `CONTACT_REQUEST_WEBHOOK_URL` is a placeholder — the n8n workflow for
  contact requests hasn't been built yet, so `POST /api/contact-requests`
  currently 500s in a real (non-mocked) run.
