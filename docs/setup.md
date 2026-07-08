# Setup

Getting this running from scratch means standing up three things in
order: a Supabase project (tables + a function + storage), three n8n
workflows (with their own credentials), and then this repo's frontend
and backend. Skipping the first two and jumping straight to `npm install`
will get you a UI that loads but can't actually chat or process a PDF.

## Prerequisites

- Node.js 20.19+ or 22.12+ recommended (see the [Node version note](#node-version-note) if you're on an older 20.x)
- npm
- A Supabase project (see [Supabase setup](#supabase-setup) below)
- An n8n instance — cloud or self-hosted (see [n8n setup](#n8n-setup) below)
- An OpenAI API key (used by all three n8n workflows: embeddings, chat, summarization)
- An SMTP account for the contact-request notification email (e.g. Gmail with an app password)

## Supabase setup

### 1. Enable the `pgvector` extension

Required for the `vector` column type and the `<=>` cosine-distance
operator used by `document_chunks` and `match_document_chunks()`.
Database → Extensions → enable `vector`.

### 2. Create the tables

Five tables, matching the schemas in
[architecture.md](./architecture.md#database-supabase) exactly (column
names, types, and nullability) — that doc is the source of truth, not
reproduced twice here:

- `documents`
- `document_chunks`
- `chat_sessions`
- `messages`
- `contact_requests`

### 3. Create the `match_document_chunks()` function

Run this in the Supabase SQL editor — this is what the chat workflow
calls to do RAG retrieval (see
[architecture.md](./architecture.md#match_document_chunks--postgres-function-not-an-app-table)
for what the `0.40` similarity floor and the `is_active` join actually do):

```sql
CREATE OR REPLACE FUNCTION match_document_chunks(
	query_embedding vector(1536),
	match_count integer
	)
RETURNS TABLE (
	id uuid,
	document_id uuid,
	content text,
	similarity float
	)
LANGUAGE sql STABLE
AS $$
SELECT
	dc.id,
	dc.document_id,
	dc.content,
	1 - (dc.embedding_vector <=> query_embedding) AS similarity
FROM document_chunks dc
JOIN documents d
	ON dc.document_id = d.id
WHERE
	 d.is_active = true
	AND (1 - (dc.embedding_vector <=> query_embedding)) >= 0.40
ORDER BY dc.embedding_vector <=> query_embedding
LIMIT match_count;
$$;
```

### 4. Create a Storage bucket

For PDF uploads — any name, matched to `SUPABASE_STORAGE_BUCKET_NAME` in
the backend's env vars (see [environment-variables.md](./environment-variables.md)).

### 5. Grab your credentials

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`SUPABASE_JWKS_URL` — Project Settings → API. You'll need
`SUPABASE_SECRET_KEY` (service-role) again shortly for n8n's Supabase
credential — same key, two places it gets used.

## n8n setup

Three workflows, none of which live in this repo (they're exported as
JSON separately — see [n8n-workflows.md](./n8n-workflows.md) for exactly
what each one does node-by-node):

- `CH - PDF to Embedding Workflow`
- `CH - Hotel Chatbot Workflow`
- `CH - Contact Request Workflow and Email Notification`

### 1. Import all three

In n8n: **Workflows → Import from File** (or paste the JSON directly).

### 2. Configure credentials

Each workflow references credentials by name — you'll need to create
and attach your own in n8n, then point each node at them:

| Credential | Used by | For |
|---|---|---|
| OpenAI API key | all three workflows | embeddings (`text-embedding-3-small`), chat (`gpt-5-mini`), summarization (`gpt-4.1-mini`) |
| Supabase API (URL + **service-role** key) | all three workflows | every Supabase node — same `SUPABASE_SECRET_KEY` from above |
| Postgres connection | `CH - Hotel Chatbot Workflow` only | the raw-SQL node calling `match_document_chunks()` — needs your Supabase project's direct Postgres connection string, not the REST API credential |
| SMTP account | `CH - Contact Request Workflow and Email Notification` only | the "Send Email Notification" node |

### 3. Activate all three workflows

**This step matters more than it looks like it should.** An n8n workflow
that isn't activated only responds to its webhook while you're sitting in
the editor with "Listen for test event" armed — it will not reliably
answer requests from the deployed app. Toggle **Active** on all three
before moving on.

### 4. Copy the production webhook URLs

Once active, each workflow's webhook node shows a **production** URL
(`.../webhook/<id>`, not `.../webhook-test/<id>`). These become
`PDF_UPLOAD_WEBHOOK_URL`, `CHAT_WEBHOOK_URL`, and
`CONTACT_REQUEST_WEBHOOK_URL` in the backend's env vars.

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

Both files are gitignored (`*.local`) — never commit real values. (For a
deployed environment instead of local dev, see
[deployment.md](./deployment.md) — env vars live in the hosting
platform's dashboard, not a `.env.local` file.)

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

## Testing

There's no automated test suite — this is a manual smoke test that
exercises every workflow end to end. Do it in this order, since later
steps depend on earlier ones:

1. **Upload a PDF** — `/admin/upload`, upload any hotel-info PDF. The
   "Active document" banner should update to the new filename within a
   few seconds of the upload finishing (that's the n8n PDF workflow
   having chunked and embedded it — if the banner updates but chat
   answers stay empty, check `document_chunks` in Supabase directly to
   confirm rows actually landed there).
2. **Ask something the PDF covers** — `/client`, ask a question you know
   the PDF answers (e.g. room rates, if listed). Should get a real,
   Markdown-formatted answer, no contact form.
3. **Ask something off-topic** — e.g. "what's the square root of 2?".
   Should get the plain decline message, **no** contact form.
4. **Ask a hotel-related question the PDF doesn't cover** — should get
   the "connect with our team" message **with** a contact form attached
   to that reply.
5. **Submit the contact form** — confirm it shows a success state, and
   check that the configured `CONTACT_REQUEST_RECIPIENT_EMAILS`
   addresses actually receive the notification email (subject, guest
   details, AI summary, full transcript).
6. **Check the dashboard** — `/admin`, confirm total sessions, questions
   asked, answer rate, and the questions-by-topic breakdown reflect the
   steps above (allow up to 8 seconds — see
   [architecture.md](./architecture.md#statistics-flow) for the polling
   interval).

## Extending

- **New admin page** — add a route in `frontend/src/App.jsx` and a page
  component under `frontend/src/pages/admin/`, following the existing
  `DashboardPage.jsx`/`UploadPdfPage.jsx` pattern (see
  [architecture.md](./architecture.md#folder-structure)).
- **Change how the assistant answers** — that's a system-prompt edit in
  n8n's "Hotel Assistant" node, not app code — see
  [n8n-workflows.md](./n8n-workflows.md#hotel-chatbot-workflow).
- **New admin stat** — extend the aggregation in `server/routes/stats.js`
  and the corresponding tile/chart in
  `frontend/src/pages/admin/DashboardPage.jsx` (see
  [architecture.md](./architecture.md#statistics-flow)).
- **New backend endpoint** — add a route file under `server/routes/`,
  mount it in `server/index.js`, document it in
  [api.md](./api.md). If it needs to call Supabase, import the shared
  client from `server/lib/supabaseClient.js` rather than creating a new one.
