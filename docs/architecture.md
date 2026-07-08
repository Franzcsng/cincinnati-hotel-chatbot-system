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
│               ├── DashboardPage.jsx     # placeholder
│               └── UploadPdfPage.jsx     # PDF upload UI
└── server/
    ├── index.js               # Express app entrypoint
    ├── loadEnv.js              # loads .env.local before anything else
    ├── lib/
    │   └── supabaseClient.js  # Supabase client (service-role key)
    └── routes/
        ├── documents.js       # POST /api/documents/upload
        ├── chat.js            # POST /api/chat/sessions, /api/chat/messages
        └── contactRequests.js # POST /api/contact-requests
```

## Frontend routes

| Path | Component | Notes |
|---|---|---|
| `/` | `LandingPage` | Guest / Admin selector |
| `/client` | `ClientPage` | Hero banner + hotel assistant chat |
| `/admin` | `AdminLayout` > `DashboardPage` | Placeholder |
| `/admin/upload` | `AdminLayout` > `UploadPdfPage` | Live upload flow |

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
   `PDF_UPLOAD_WEBHOOK_URL` (n8n), which is expected to download the PDF via
   `signed_url`, chunk it, and populate `document_chunks` with embeddings
   asynchronously. A webhook failure is logged but does not fail the upload
   request — the document record has already been created at that point.
6. Backend responds with the new document record; frontend shows a
   success/error state.

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
   The frontend reads `reply.agent_message` and renders it as a Markdown
   chat bubble via `react-markdown` (the system prompt instructs the agent
   to format lists/prices in Markdown, and to fall back to a fixed
   "connect with our team" message with `show_contact_form: true` when a
   hotel-related question isn't covered by the knowledge base — vs. a
   plain decline with `show_contact_form: false` for off-topic questions).
   A typing indicator shows while the request is in flight; a missing/empty
   `agent_message` or a failed request shows an error banner instead.
6. If that reply has `show_contact_form: true`, a `ContactForm` (name,
   email, phone) renders directly under it — attached to that specific
   message, not a global widget state, so multiple fallback replies across
   a conversation each get their own form/submission independently.
   Submitting calls `POST /api/contact-requests` with
   `{ session_id, name, email, phone, topic, question }`, where `topic`
   comes from the triggering reply and `question` is the guest's message
   that prompted it. The backend forwards this to
   `CONTACT_REQUEST_WEBHOOK_URL` (n8n) — currently a placeholder env var
   with no real workflow behind it yet. On success the form is replaced
   with a thank-you note, scoped to that message only.
7. No message or contact-request content is persisted in Supabase by our
   backend (`chat_sessions` has no messages column) — messages live only in
   frontend component state for the duration of the page visit. Whatever
   the n8n workflows do with the data server-side is outside this app's
   database writes.
