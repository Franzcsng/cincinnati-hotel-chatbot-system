# API Reference

Base URL (local dev): `http://localhost:4000`

No authentication is required on any endpoint yet.

---

## `GET /health`

Health check.

**Response `200`**
```json
{ "status": "ok" }
```

---

## `GET /api/documents/active`

Returns the currently active document, if any. Used by the Upload PDF page
to show the admin which file the assistant is answering from.

**Response `200`**
```json
{
  "document": {
    "id": "uuid",
    "filename": "hotel-info.pdf",
    "uploaded_at": "2026-07-07T00:00:00.000Z"
  }
}
```
`document` is `null` if no document has ever been uploaded.

**Response `500`** — database lookup failure
```json
{ "error": "Failed to look up active document" }
```

---

## `POST /api/documents/upload`

Uploads a new PDF to serve as the AI assistant's knowledge base. Retires
the previously active document (and its chunks) in the same request. See
[architecture.md](./architecture.md#pdf-upload-flow) for the full flow.

**Request**: `multipart/form-data`

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | file | yes | Must be `application/pdf`. Max 20 MB. |

**Response `201`**
```json
{
  "document": {
    "id": "uuid",
    "filename": "hotel-info.pdf",
    "storage_path": "<uuid>-hotel-info.pdf",
    "uploaded_at": "2026-07-07T00:00:00.000Z",
    "is_active": true
  }
}
```

**Response `400`** — missing file or wrong file type
```json
{ "error": "Only PDF files are allowed" }
```
```json
{ "error": "No PDF file provided" }
```

**Response `500`** — storage upload, database, lookup, or signed URL
generation failure
```json
{ "error": "<message>" }
```

**Side effect**: on success, POSTs to `PDF_UPLOAD_WEBHOOK_URL` with:
```json
{
  "document_id": "uuid",
  "filename": "hotel-info.pdf",
  "storage_path": "<uuid>-hotel-info.pdf",
  "signed_url": "https://<project>.supabase.co/storage/v1/object/sign/...?token=..."
}
```
`signed_url` is a 1-hour signed URL for the uploaded PDF (works even if the
storage bucket is private) so the n8n workflow can download the file for
chunking/embedding. A non-2xx response or network failure from the webhook
is logged server-side but does **not** fail the upload request — by that
point the `documents` row already exists.

---

## `POST /api/chat/sessions`

Creates a new `chat_sessions` row. Called lazily by the frontend on the
visitor's first chat message — see
[architecture.md](./architecture.md#chat-flow) for why.

**Request**: no body required.

**Response `201`**
```json
{
  "session": {
    "id": "uuid",
    "started_at": "2026-07-08T00:00:00.000Z",
    "ended_at": null
  }
}
```

**Response `500`** — database insert failure
```json
{ "error": "Failed to start chat session" }
```

---

## `POST /api/chat/messages`

Forwards a chat message to the n8n chat workflow and relays back its
response. This route itself never writes to Supabase — the n8n workflow
writes two `messages` rows (`role='client'` and `role='assistant'`) directly
as part of processing the webhook call. See
[architecture.md](./architecture.md#messages).

**Request**: `application/json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `session_id` | string | yes | From `POST /api/chat/sessions` |
| `message` | string | yes | Non-empty after trimming |

**Response `200`**
```json
{
  "reply": {
    "session_id": "uuid",
    "agent_message": "Here are the nightly \"From\" rates...\n\n- **Market Queen** — **$189** / night",
    "topic": "room rates",
    "is_answered": true,
    "show_contact_form": false
  }
}
```
`reply` is passed through as-is from `CHAT_WEBHOOK_URL` (n8n) — this route
doesn't validate its shape. `agent_message` is Markdown-formatted (the n8n
system prompt instructs it to use lists/bold, no headers) and is rendered
via `react-markdown`. When `show_contact_form` is `true` (the agent
couldn't answer from the knowledge base, but the question was
hotel-related), the frontend renders a `ContactForm` under that reply —
see [architecture.md](./architecture.md#chat-flow). `topic` is forwarded
into the contact form submission for context; `is_answered` is returned
but not currently used by the frontend.

**Response `400`** — missing/empty `session_id` or `message`
```json
{ "error": "session_id and message are required" }
```

**Response `502`** — webhook unreachable or returned a non-2xx status
```json
{ "error": "Failed to reach the hotel assistant" }
```

---

## `POST /api/contact-requests`

Submits a guest's "connect with our team" request, shown when a chat reply
has `show_contact_form: true`. Forwards to `CONTACT_REQUEST_WEBHOOK_URL`
(n8n) — this route never writes to Supabase itself; the n8n workflow
writes the `contact_requests` row (see
[architecture.md](./architecture.md#contact_requests)) and handles
notifying `recipient_emails`.

**Request**: `application/json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `session_id` | string | yes | From the chat session this request originated in |
| `name` | string | yes | |
| `email` | string | yes | |
| `phone` | string | no | |
| `topic` | string | no | From the triggering chat reply's `topic` field |
| `question` | string | no | The guest's original question, for the team's context |

**Response `200`**
```json
{ "status": "submitted" }
```

**Side effect**: forwards to `CONTACT_REQUEST_WEBHOOK_URL` with:
```json
{
  "session_id": "uuid",
  "name": "Jane Guest",
  "email": "jane@example.com",
  "phone": null,
  "topic": "Dining",
  "question": "Do you have a rooftop restaurant?",
  "recipient_emails": ["frontdesk@example.com", "manager@example.com"]
}
```
`recipient_emails` is server config, not guest input — parsed from
`CONTACT_REQUEST_RECIPIENT_EMAILS` (see
[environment-variables.md](./environment-variables.md)), not part of the
request body above. It's who the n8n workflow should notify about this
request.

**Response `400`** — missing `session_id`, `name`, or `email`
```json
{ "error": "session_id, name, and email are required" }
```

**Response `500`** — `CONTACT_REQUEST_WEBHOOK_URL` not configured
```json
{ "error": "Contact requests are not configured yet" }
```

**Response `502`** — webhook unreachable or returned a non-2xx status
```json
{ "error": "Failed to submit your request" }
```

---

## `GET /api/stats`

Powers the admin Dashboard page. See
[architecture.md](./architecture.md#statistics-flow) for how the numbers
are derived.

**Response `200`**
```json
{
  "total_sessions": 24,
  "total_questions": 41,
  "answered_questions": 33,
  "questions_by_topic": [
    { "topic": "Rooms", "count": 12 },
    { "topic": "Dining", "count": 8 },
    { "topic": "Parking", "count": 5 }
  ]
}
```
`questions_by_topic` is sorted descending by `count`. Derived from
`messages` rows where `role = 'client'` (see
[architecture.md](./architecture.md#statistics-flow) for why that filter
matters — the table has two rows per exchange). Topics are normalized with
title-casing before grouping (`"room rates"` and `"Room rates"` count as
one topic) and a blank/null `topic` is bucketed under `"Uncategorized"`.

**Response `500`** — database lookup failure
```json
{ "error": "Failed to load statistics" }
```
