# The Cincinnati Hotel — Documentation

A boutique hotel website with separate guest and admin experiences, plus an
admin-uploaded PDF knowledge base that powers an AI assistant.

This folder is the living documentation for the project. Update the relevant
doc whenever a page, route, table, or env var changes — don't let this drift
from the code.

## Contents

- [setup.md](./setup.md) — Supabase schema/function setup, n8n workflow import, install, running, testing, and extending the system
- [architecture.md](./architecture.md) — tech stack, folder structure, routes, request flows
- [api.md](./api.md) — backend API reference
- [n8n-workflows.md](./n8n-workflows.md) — what the three n8n workflows actually do (PDF chunking, chat RAG, contact-request email), node-by-node
- [deployment.md](./deployment.md) — Vercel + Railway setup, env vars per platform, CORS, the deploy bugs hit and how they were fixed
- [environment-variables.md](./environment-variables.md) — every env var, what it's for, where it's used
- [branding.md](./branding.md) — brand voice, color palettes, typography

## Live deployment

- Frontend: <https://cincinnati-hotel-chatbot-system.vercel.app>
- Backend: `https://cincinnati-hotel-chatbot-system-production.up.railway.app`

Both auto-deploy from `main`. See [deployment.md](./deployment.md) for
the full setup.

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

**Resolved:**
- Contact-request email used to only reach `recipient_emails[0]` and sent
  from Resend's sandbox domain — fixed via n8n's SMTP email node with a
  real sender address and the full recipient list.
- `document_chunks.chunk_index` was always `0`, then briefly broken again
  by a stray character during the fix — both resolved, now correctly
  stores each chunk's real position.

See [n8n-workflows.md](./n8n-workflows.md) for detail on both.

**Open issue to verify before submission:** in the workflow JSON,
`CH - PDF to Embedding Workflow` and
`CH - Contact Request Workflow and Email Notification` are both
`"active": false` in n8n — only the chat workflow is active. An inactive
workflow's webhook only responds while you're in the n8n editor with
"Listen for test event" armed, not reliably from the live deployed app.
If still inactive, **PDF uploads and contact-form submissions on the
production site will silently fail** unless you happen to be watching
the n8n editor at that exact moment. See
[n8n-workflows.md](./n8n-workflows.md) for the fix (activate both, then
update `PDF_UPLOAD_WEBHOOK_URL`/`CONTACT_REQUEST_WEBHOOK_URL` on Railway
to the resulting production `/webhook/...` paths).
