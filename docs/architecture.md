# Architecture

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 7, `react-router-dom` v7 |
| Backend | Node.js + Express 5 |
| File storage | Supabase Storage |
| Database | Supabase (Postgres) |
| Automation | n8n (webhook-triggered: PDF chunking/embedding, chat responses, contact requests) |

No authentication/authorization layer exists yet anywhere in the app —
this is a deliberate, temporary simplification for the current build phase.

This app's Express backend is a thin proxy in front of three n8n
workflows — it never calls OpenAI, never runs embedding search, and never
sends email. See [n8n-workflows.md](./n8n-workflows.md) for exactly what
each workflow does node-by-node; this doc covers the app-side half of each
flow.

## Folder structure

```
cincinnati-hotel/
├── docs/                     # this folder
├── frontend/
│   ├── index.html
│   └── src/
│       ├── App.jsx           # route table
│       ├── main.jsx          # React root, BrowserRouter
│       ├── index.css         # global theme (fonts, CSS variables)
│       ├── components/
│       │   ├── ChatWidget.jsx  # hotel assistant chat box
│       │   └── ContactForm.jsx # "connect with our team" lead form
│       └── pages/
│           ├── LandingPage.jsx
│           ├── client/
│           │   └── ClientPage.jsx        # hero banner + chat section
│           └── admin/
│               ├── AdminLayout.jsx       # sidebar shell, <Outlet/>
│               ├── DashboardPage.jsx     # stats: KPI tiles + questions-by-topic
│               └── UploadPdfPage.jsx     # PDF upload UI + active document display
└── server/
    ├── index.js               # Express app entrypoint
    ├── loadEnv.js              # loads .env.local before anything else
    ├── lib/
    │   └── supabaseClient.js  # Supabase client (service-role key)
    └── routes/
        ├── documents.js       # GET /api/documents/active, POST /api/documents/upload
        ├── chat.js            # POST /api/chat/sessions, /api/chat/messages
        ├── contactRequests.js # POST /api/contact-requests
        └── stats.js           # GET /api/stats
```

## Frontend routes

| Path | Component | Notes |
|---|---|---|
| `/` | `LandingPage` | Guest / Admin selector |
| `/client` | `ClientPage` | Hero banner + hotel assistant chat |
| `/admin` | `AdminLayout` > `DashboardPage` | Live stats: total sessions, questions asked, answer rate, questions-by-topic bar list |
| `/admin/upload` | `AdminLayout` > `UploadPdfPage` | Live upload flow + active document name/date |

## Database (Supabase)

### `documents`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `filename` | `text` | Original PDF filename |
| `storage_path` | `varchar` | Path within the storage bucket |
| `uploaded_at` | `timestamptz` | |
| `is_active` | `bool` | Only one row should be `true` at a time |

### `document_chunks`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `document_id` | `uuid` | FK to `documents.id` |
| `chunk_index` | `int2` | Order of the chunk within the document |
| `content` | `varchar` | Chunk text |
| `embedding_vector` | `vector` | Embedding for retrieval |
| `created_at` | `timestamptz` | |

**Invariant:** the system serves exactly one active document to the AI
assistant at a time. Uploading a new PDF retires the previous one (see
below) so stale embeddings never coexist with fresh ones.

### `chat_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `started_at` | `timestamptz` | Set when the row is created |
| `ended_at` | `timestamptz` | Nullable — not currently set by any code path |

### `messages`

Written directly by the n8n chat workflow (**not** by this app's Express
backend — the backend only reads it, for stats). Each Q&A exchange
produces **two rows**, one per `role`, with `topic`/`answered` set
identically on both:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `session_id` | `uuid` | FK to `chat_sessions.id` |
| `role` | `text` | `'client'` (the guest's question) or `'assistant'` (the reply); nullable |
| `message` | `text` | The question or the reply text; nullable |
| `topic` | `text` | Nullable. Casing is inconsistent from n8n (`"room rates"` vs `"Room rates"` both occur) — `GET /api/stats` normalizes this, see below |
| `answered` | `bool` | Nullable |
| `created_at` | `timestamptz` | Nullable |

`GET /api/stats` (see [Statistics flow](#statistics-flow)) filters to
`role = 'client'` when counting questions/topics — querying both roles
would double-count every exchange, since topic/answered are duplicated
onto the assistant row too. Full node-by-node detail on how these rows
get written: [n8n-workflows.md](./n8n-workflows.md#hotel-chatbot-workflow).

### `contact_requests`

Written directly by the n8n contact-request workflow (not by this app's
Express backend — `contactRequests.js` only forwards to the webhook, it
never writes to Supabase itself).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `session_id` | `uuid` | FK to `chat_sessions.id` |
| `name` | `text` | |
| `phone` | `text` | Nullable |
| `email` | `text` | Nullable |
| `question` | `text` | Nullable |
| `topic` | `text` | Nullable |
| `created_at` | `timestamptz` | Nullable |

Not currently queried by this app anywhere (no admin view of contact
requests exists yet — only the stats dashboard). Written by the n8n
contact-request workflow alongside an AI-summarized email — see
[n8n-workflows.md](./n8n-workflows.md#contact-request-workflow-and-email-notification)
for the two known issues in that email step (recipient list truncated to
one address, sandbox sender domain) that should be fixed before relying
on it.

## PDF upload flow

Triggered by the admin Upload PDF page (`POST /api/documents/upload`,
detailed in [api.md](./api.md)):

1. Browser sends the PDF as `multipart/form-data` to the backend.
2. Backend uploads the file to the Supabase Storage bucket
   (`SUPABASE_STORAGE_BUCKET_NAME`).
3. Backend looks up the current `documents` row where `is_active = true`.
   If one exists:
   - delete all `document_chunks` referencing it (avoids duplicate/stale embeddings)
   - set its `is_active` to `false`
4. Backend inserts a new `documents` row (`is_active = true`).
5. Backend generates a 1-hour signed URL for the uploaded file and POSTs
   `{ document_id, filename, storage_path, signed_url }` to the
   `PDF_UPLOAD_WEBHOOK_URL` (n8n), which downloads the PDF via
   `signed_url`, chunks it (900 chars/chunk, 100-char overlap — see
   [n8n-workflows.md](./n8n-workflows.md#pdf-to-embedding-workflow) for
   the exact chunking logic), and populates `document_chunks` with
   embeddings asynchronously. A webhook failure is logged but does not
   fail the upload request — the document record has already been
   created at that point.
6. Backend responds with the new document record; frontend shows a
   success/error state and refetches the active document (see below).

## Active document lookup

`GET /api/documents/active` returns the `documents` row where
`is_active = true` (or `{ document: null }` if none exists yet — e.g. before
the first upload). The Upload PDF page calls this on mount and again after
every successful upload, so the admin always sees which file the assistant
is currently answering from, not just a "success" toast that fades.

## Chat flow

Triggered by the `ChatWidget` on the client landing page
(`POST /api/chat/sessions`, `POST /api/chat/messages`, detailed in
[api.md](./api.md)):

1. **Session creation is lazy** — a `chat_sessions` row is only created when
   the visitor sends their *first* message, not when the page loads or the
   chat widget mounts. This keeps the table meaningful (a row = an actual
   conversation, not a page view) and avoids duplicate-session bugs from
   React StrictMode double-invoking mount effects in development.
2. On first send, the frontend calls `POST /api/chat/sessions`; the backend
   inserts a `chat_sessions` row and returns its `id`. The frontend caches
   this id (in a ref, not state, so it survives re-renders without
   retriggering effects) and reuses it for the rest of the conversation.
3. The frontend adds the user's message to local component state
   immediately (optimistic UI) and calls `POST /api/chat/messages` with
   `{ session_id, message }`.
4. The backend forwards `{ session_id, message }` to `CHAT_WEBHOOK_URL`
   (n8n) and relays back whatever the webhook responds with, under
   `{ reply: <webhook JSON> }`.
5. The n8n workflow returns
   `{ session_id, agent_message, topic, is_answered, show_contact_form }`.
   `topic` is one of 16 fixed categories the RAG agent classifies every
   question into (even unanswered ones get a real topic — only genuinely
   off-topic questions get `"Unrelated"`); see
   [n8n-workflows.md](./n8n-workflows.md#hotel-chatbot-workflow) for the
   full list and the exact fallback-message logic. The frontend reads
   `reply.agent_message` and renders it as a Markdown chat bubble via
   `react-markdown`. A typing indicator shows while the request is in
   flight; a missing/empty `agent_message` or a failed request shows an
   error banner instead.
6. If that reply has `show_contact_form: true`, a `ContactForm` (name,
   email, phone) renders directly under it — attached to that specific
   message, not a global widget state, so multiple fallback replies across
   a conversation each get their own form/submission independently.
   Submitting calls `POST /api/contact-requests` with
   `{ session_id, name, email, phone, topic, question }`, where `topic`
   comes from the triggering reply and `question` is the guest's message
   that prompted it. The backend adds `recipient_emails` — parsed
   server-side from the comma-separated `CONTACT_REQUEST_RECIPIENT_EMAILS`
   env var, not guest input — and forwards the combined payload to
   `CONTACT_REQUEST_WEBHOOK_URL` (n8n). On success the form is replaced
   with a thank-you note, scoped to that message only. n8n looks up the
   full `messages` history for the session (not just the single triggering
   question) to build an AI-summarized email — see
   [n8n-workflows.md](./n8n-workflows.md#contact-request-workflow-and-email-notification).
7. Neither this app's Express backend nor its frontend persists the
   conversation anywhere — no message content, no transcript. The chat
   transcript in the browser lives only in frontend component state for
   the duration of the page visit. **The n8n chat workflow itself** writes
   two `messages` rows per exchange (`role='client'` and `role='assistant'`)
   directly to Supabase as part of processing the webhook call — see the
   `messages` table above. That's what `GET /api/stats` reads from.
   Similarly, contact-request content is written to `contact_requests` by
   **the n8n contact-request workflow**, not by this app.

## Statistics flow

`GET /api/stats` powers the admin Dashboard page, reading tables that n8n
writes to (see [Database](#database-supabase) above) — this app's backend
never writes to `messages` or `contact_requests` itself:

1. `total_sessions` — a `count`-only query (`head: true`) against
   `chat_sessions`, so it never fetches session rows just to count them.
2. Backend fetches `messages` rows **filtered to `role = 'client'`** (small
   dataset for this app's scale — no need for a `GROUP BY` RPC) and reduces
   their `topic`/`answered` values in Node into `total_questions`,
   `answered_questions`, and `questions_by_topic` (topic + count, sorted
   descending). Filtering to one role is required, not optional —
   `messages` has two rows per exchange with the same topic/answered value,
   so querying both roles would double every count. Topics are normalized
   with title-casing before grouping (blank/null → `"Uncategorized"`) since
   n8n's topic classification isn't consistently cased — `"room rates"` and
   `"Room rates"` are the same topic and were observed splitting into two
   rows in production data before this normalization was added.
3. The Dashboard page polls this endpoint every 8 seconds while mounted
   (plus an immediate fetch on mount) — simple polling rather than Supabase
   Realtime/websocket subscriptions, since that would require exposing a
   Supabase anon client and RLS policies to the frontend for read access,
   which doesn't exist yet (see [environment-variables.md](./environment-variables.md)
   — only `SUPABASE_SECRET_KEY` is configured, and only server-side).
   Polling meets "updates immediately after each chat session" closely
   enough for this app's scale without that added surface area.
4. Rendered as a KPI row (total sessions, questions asked, answer rate) plus
   a horizontal bar list for `questions_by_topic` — single-hue (brick),
   magnitude-encoded by bar length, sorted descending, count labeled at
   each bar's tip.
