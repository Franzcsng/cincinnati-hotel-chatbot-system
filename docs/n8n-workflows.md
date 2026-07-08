# n8n Workflows

This app's Express backend never talks to OpenAI, never runs embedding
search, and never sends email — all of that lives in three n8n workflows,
triggered by webhooks the backend calls (see
[architecture.md](./architecture.md) and [api.md](./api.md) for the
backend side of each call). This doc describes what each workflow actually
does, based on their exported JSON.

**Resolved:**
- The contact-request email used to only reach `recipient_emails[0]` and
  sent from Resend's sandbox domain. Both fixed — the workflow now uses
  n8n's built-in SMTP email node with `toEmail` bound directly to the
  `recipient_emails` array (coerced to a comma-joined string, matching
  the multi-recipient format SMTP expects), sent from a real address
  instead of a sandbox domain. See
  [Contact Request Workflow](#contact-request-workflow-and-email-notification).
- `document_chunks.chunk_index` used to have a stray literal `"`
  character in the field expression (`={{ $json.chunkIndex }}\"`), which
  would have errored out the insert for every chunk. Fixed — the
  expression is now exactly `={{ $json.chunkIndex }}`, correctly storing
  each chunk's real position in the document. See
  [PDF to Embedding Workflow](#pdf-to-embedding-workflow).

**Open issue — check this in the n8n editor, not just here:** in the
exported JSON, `CH - PDF to Embedding Workflow` and
`CH - Contact Request Workflow and Email Notification` both have
`"active": false` at the workflow level; only `CH - Hotel Chatbot
Workflow` is `"active": true`. This lines up with `server/.env.local`:
`PDF_UPLOAD_WEBHOOK_URL` and `CONTACT_REQUEST_WEBHOOK_URL` are still
`/webhook-test/...` paths, while `CHAT_WEBHOOK_URL` was switched to a
production `/webhook/...` path when that workflow got activated earlier
(see the "fallback response" webhook-404 issue from earlier in this
project). An n8n test webhook only responds while you have that
workflow open in the editor with "Listen for test event" armed — it does
**not** reliably answer requests from the live deployed app. If these
two are still inactive, PDF uploads and contact-form submissions on the
production site will silently fail (404 from n8n) any time you aren't
sitting in the editor watching them. Activate both workflows in n8n, then
switch their env vars on Railway from `/webhook-test/...` to the
production `/webhook/...` path n8n gives you once active.

---

## PDF to Embedding Workflow

**File:** `CH - PDF to Embedding Workflow.json`
**Trigger:** `PDF_UPLOAD_WEBHOOK_URL` — POST from `server/routes/documents.js` after a successful upload
**Input:** `{ document_id, filename, storage_path, signed_url }` (only `document_id` and `signed_url` are actually used)

1. **Download File** — HTTP GET to `signed_url`, pulling the actual PDF
   bytes from Supabase Storage (this is why the backend generates a signed
   URL rather than just passing the storage path — n8n needs to fetch the
   file itself, and the bucket isn't assumed to be public).
2. **Extract Text from File** — n8n's built-in PDF text extraction
   (`extractFromFile`, operation `pdf`).
3. **Chunk PDF into Sections** (Code node) — custom chunking, not a
   library:
   - Normalizes line endings, then splits on blank lines (`\n\s*\n`) to
     get paragraph-like sections.
   - **Fallback:** if that produces only one section (the PDF didn't
     preserve paragraph breaks — common with PDF text extraction), it
     re-splits using a regex matching capitalized heading-like lines or
     the literal pattern `"The Cincinnati Hotel |"` (a page-header marker
     specific to this PDF's layout).
   - Accumulates sections into chunks capped at **900 characters**,
     starting a new chunk when the next section would exceed that.
   - A single section longer than 900 characters (rare, but possible) is
     force-split into overlapping windows: 900-character slices advancing
     800 characters at a time, i.e. a **100-character overlap** — this is
     what preserves context across an artificial chunk boundary that
     doesn't align with natural paragraph breaks.
   - Output: one item per chunk, `{ chunkIndex, content, length }`.
4. **OpenAI Embedding** (parallel branch) — `POST
   https://api.openai.com/v1/embeddings`, model `text-embedding-3-small`,
   one call per chunk (`input: content`).
5. **Merge** (combine by position) — recombines each chunk's original
   `{ chunkIndex, content }` with its embedding response
   (`{ data: [{ embedding, index }] }`), since the embedding branch and
   the original-chunk-data branch ran in parallel off the same Chunk node.
6. **Insert Chunks to document_chunks** — one Supabase insert per merged
   item:
   - `document_id` — from the webhook body
   - `content` — the chunk text
   - `embedding_vector` — `data[0].embedding`
   - `chunk_index` — `={{ $json.chunkIndex }}`, the chunk's real position
     in the document (index 0). Originally this read `data[0].index` —
     the OpenAI embeddings response's per-call array index, always `0`
     for a single-input call, making every row's `chunk_index` `0`
     regardless of actual position. A later fix attempt introduced a
     stray literal `"` outside the expression braces
     (`={{ $json.chunkIndex }}\"`), which would have failed the insert
     entirely for every chunk. Both are now resolved.

**No cleanup step exists in this workflow** — because there doesn't need
to be one. `server/routes/documents.js` already deletes the previous
document's `document_chunks` and deactivates it *before* calling this
webhook (see [architecture.md](./architecture.md#pdf-upload-flow)), so
this workflow only ever inserts chunks for the new, already-active
document. No race, no duplicate-embeddings risk.

---

## Hotel Chatbot Workflow

**File:** `CH - Hotel Chatbot Workflow.json`
**Trigger:** `CHAT_WEBHOOK_URL` — POST from `server/routes/chat.js`
**Input:** `{ session_id, message }`

This is a Retrieval-Augmented Generation (RAG) pipeline: embed the
question, find similar chunks, feed them to the model as context, force a
structured response.

1. **Insert User Message** — inserts into `messages`:
   `role: 'client'`, `message: <the question>`, `session_id`,
   `answered: false`. `topic` is left unset here — it isn't known yet, and
   gets backfilled in step 7.
2. **Generate Message Embedding** — same OpenAI embeddings call as the PDF
   workflow, embedding the guest's question text.
3. **Match Message Embedding** (Postgres node, raw SQL) — calls
   `match_document_chunks(embedding, 5)`, top 5 chunks by cosine
   similarity, scoped to the current active document only, excluding
   anything below a 0.40 similarity floor — full function definition and
   why those specific behaviors matter in
   [architecture.md](./architecture.md#match_document_chunks--postgres-function-not-an-app-table).
   The query wraps the call in `UNION ALL SELECT NULL ... WHERE NOT
   EXISTS (...)`, so it **always returns at least one row** — an
   empty/null row when nothing clears the similarity floor (e.g. no PDF
   uploaded yet, or a genuinely off-topic question) — rather than an
   empty result set that could break the next step.
4. **Build String Context** (Code node) — concatenates the matched
   chunks' `content` fields, separated by `\n\n---\n\n`, into one
   `context` string passed to the model.
5. **Hotel Assistant** (LangChain Agent, model `gpt-5-mini`) — the system
   prompt enforces:
   - Answer **only** from the provided context, never outside knowledge.
   - Classify every question into exactly one of 16 fixed topics (`Room
     Rates`, `Rooms & Suites`, `Amenities`, `Dining`, `Policies`,
     `Check-in / Check-out`, `Parking`, `Transportation`, `Pet Policy`,
     `Accessibility`, `Location`, `Reservations`, `Contact Information`,
     `Promotions`, `General Hotel Information`, `Other Hotel Inquiry`,
     `Unrelated`) — even when unanswered, a hotel-related question still
     gets its real topic, not `Unrelated`. Only genuinely off-topic
     questions (or prompt-injection attempts asking it to ignore
     instructions) get `Unrelated`.
   - Markdown formatting guidance (lists, bold, no headers) for the
     response text — matches what `react-markdown` renders in
     [ChatWidget.jsx](../frontend/src/components/ChatWidget.jsx).
   - Output is forced through a **Structured Output Parser** with schema
     `{ topic, is_answered, agent_response }`.

   *(Note the field is called `agent_response` at this stage — it becomes
   `agent_message` later, see the field-renaming note below.)*
6. **Is Question Answered?** (If node) — branches strictly on
   `output.is_answered === true`.

### Branch A — answered

7. **Insert Assistant Message** — inserts a second `messages` row:
   `role: 'assistant'`, `message: output.agent_response`,
   `topic: output.topic`, `answered: output.is_answered`.
8. **Update User Topic** — `UPDATE messages SET topic, answered WHERE id
   = <the step-1 row's id>`. This is the backfill: the guest's own
   `role: 'client'` row now gets the same `topic`/`answered` values as the
   assistant's row. **This is exactly why `GET /api/stats` filters to
   `role = 'client'`** (see [architecture.md](./architecture.md#statistics-flow))
   — both rows end up with identical topic/answered values by design, so
   querying either role (but not both) gives the correct count.
9. **Respond to Webhook** — returns
   `{ session_id, agent_message, topic, is_answered, show_contact_form: false }`.
   `agent_message` here is read from the *insert's return value*
   (`Insert Assistant Message.message`) rather than directly from the
   agent's `output.agent_response` — functionally the same value, just
   sourced from the DB round-trip instead of the original output.
   `show_contact_form` is hardcoded `false` — no reason to offer it when
   the question was answered.

### Branch B — not answered

7. **Determine Fallback Response** (Code node) — the actual decision
   logic behind the two different fallback messages:
   ```js
   const isUnrelated = output.topic === 'Unrelated';
   agent_message = isUnrelated
     ? "Sorry, I can only help with questions about The Cincinnati Hotel. Is there anything about the hotel I can help you with?"
     : "Sorry, I don't have that information on hand. Would you like to connect with our team? They'd be happy to help.";
   answered = false;
   show_contact_form = !isUnrelated;
   ```
   So: **off-topic** questions get a plain decline, no contact form.
   **Hotel-related-but-not-in-the-PDF** questions get the "connect with
   our team" message *and* `show_contact_form: true` — this is exactly
   the signal [ChatWidget.jsx](../frontend/src/components/ChatWidget.jsx)
   uses to render `ContactForm` under that specific reply.
8. **Insert Fallback Assistant Message** — same pattern as branch A's
   step 7, storing the fallback text as the `role: 'assistant'` row.
9. **Update User Topic2** — same backfill as branch A's step 8.
10. **Fallback Response to Webhook** — returns
    `{ session_id, agent_message, topic, is_answered: false, show_contact_form }`.

---

## Contact Request Workflow and Email Notification

**File:** `CH - Contact Request Workflow and Email Notification.json`
**Trigger:** `CONTACT_REQUEST_WEBHOOK_URL` — POST from `server/routes/contactRequests.js`
**Input:** `{ session_id, name, email, phone, topic, question, recipient_emails }`

Two branches fan out from the webhook in parallel:

### Branch A — persist the request

**Insert Contact Details** — inserts into `contact_requests`
(`sessoin_id` — yes, that's the actual column name, typo and all, matched
exactly as given in the schema), `name`, `email`, `phone`, `topic`,
`question`, all taken straight from the request body. Terminal — no
further steps.

### Branch B — summarize and email

1. **Fetch Messages** — `getAll` on `messages` filtered to
   `session_id = body.session_id`, ordered `created_at.asc`, `returnAll`.
   This pulls the **entire conversation history** for the session — every
   `role: 'client'`/`role: 'assistant'` row written during the chat, in
   order. This is what satisfies the spec's "summary of the conversation
   so far" requirement — the summary isn't built from just the single
   triggering question, it's built from everything the guest and
   assistant said in that session.
2. **Build Conversation Transcript** (Code node) — builds two plain-text
   transcripts from those rows: `transcript` (`"Client: ...\n\nAssistant:
   ..."`) and `transcriptWithTime` (same, with a `[timestamp]` line before
   each turn).
3. **Summarize Transcript** (OpenAI, `gpt-4.1-mini`) — system prompt asks
   it to summarize the transcript in 2–4 sentences for hotel staff: what
   the guest wanted, key preferences/details, and the unanswered question
   if any. Explicitly told not to invent information or repeat the whole
   conversation.
4. **Send Email Notification** (n8n's built-in SMTP email node, not
   Resend) — builds an HTML email with guest details
   (name/email/phone/session_id), the inquiry (topic + the unanswered
   question), the AI-generated summary, and the full timestamped
   transcript. `toEmail` is bound directly to
   `{{ $('Webhook').item.json.body.recipient_emails }}` — n8n resolves an
   array in a string-typed field via JS's `Array.toString()`, which joins
   with commas, matching the comma-separated multi-recipient format
   `nodemailer`/SMTP expects. `fromEmail` is a real address rather than a
   sandbox sender domain, so delivery to non-owner recipients (like
   `idan@tauga.ai`) isn't at risk of being restricted the way Resend's
   `onboarding@resend.dev` sandbox sender would be.

---

## Cross-reference: what this app's backend never does

Worth stating plainly, since it's easy to assume otherwise reading the
Express route code alone: **this app's backend never calls OpenAI, never
touches `document_chunks`/`messages`/`contact_requests` beyond reading
`messages` for stats, and never sends email.** Every one of those
responsibilities lives in the workflows above. The backend's job is
narrower than it might look — upload/serve files, proxy webhook calls,
and read aggregate stats.
