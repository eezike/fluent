# Fluent

A chat-first agent for brand deal workflows. It reads brand emails in Gmail, checks offers against your rate card in Google Sheets, keeps deals in Airtable, and drafts replies. It never sends anything without your approval.

- **`apps/web`**: Next.js PWA + API (chat, ideas, connectors, approvals). Deploys to Vercel.
- **`apps/extension`**: Chrome side-panel extension. Same chat, plus it can read the page you're looking at.
- **`packages/shared`**: the wire protocol, streaming client and markdown renderer both apps use.
- **`supabase/migrations`**: database schema.

## How it works

- **Model-agnostic.** The agent loop uses the Vercel AI SDK. Set `FLUENT_MODEL=<provider>:<model>` (for example `anthropic:claude-sonnet-5-5`, `openai:...`, `google:...`) and the matching API key. Add another provider by installing its `@ai-sdk/*` package and registering it in `apps/web/lib/agent/models.ts`. Conversations are stored as provider-independent messages, so you can switch models mid-history.
- **Connectors are tools.** `apps/web/lib/agent/tools.ts` exposes Gmail (search, read thread, save draft, queue send), Sheets (rate card, any range) and Airtable (schema, list, create, update). Add a connector by adding a client in `lib/connectors/` and a tool next to the others.
- **Approvals.** `send_gmail_reply` doesn't send. It writes a row to `pending_actions` and the UI shows the draft with Send / Edit / Dismiss. Only the approve endpoint sends, and it claims the row first so a double click can't send twice. There is no delete tool.
- **Secrets.** Google refresh tokens and Airtable tokens are AES-256-GCM encrypted in `connections`, a table no client policy can read. Only the server (service role) touches it.
- **Auth.** Supabase email + password. Clients send the access token as a Bearer header, which is what lets the extension and the PWA share one API.
- **Prompt injection.** Emails, sheets and page text are treated as untrusted data in the system prompt, and the only outbound action needs a human click.

## Setup

### 1. Supabase
Create a project, then run `supabase/migrations/0001_init.sql` in the SQL editor. Copy the project URL, anon key and service role key.

### 2. Google (Gmail + Sheets)
In Google Cloud Console: create a project, enable the **Gmail API** and **Google Sheets API**, configure the OAuth consent screen, and create an **OAuth client (Web application)** with this redirect URI:

```
<APP_URL>/api/connectors/google/callback
```

While the app is in "Testing", add yourself as a test user. The Gmail scopes are restricted: to let other people connect, you'll need Google's app verification.

### 3. Airtable
In the app's Connectors sheet, paste a personal access token (create one at airtable.com/create/tokens with `data.records:read`, `data.records:write` and `schema.bases:read` on your deals base), plus the base ID and table name.

### 4. Environment
```bash
cp apps/web/.env.example apps/web/.env.local   # then fill it in
openssl rand -base64 32                        # → ENCRYPTION_KEY
```

### 5. Run
```bash
npm install
npm run dev            # http://localhost:3000
```

### 6. Deploy
Import the repo in Vercel, set **Root Directory** to `apps/web`, add the same environment variables (with `APP_URL` set to your production URL), and add that URL's callback to your Google OAuth client.

### 7. Chrome extension
```bash
# reads NEXT_PUBLIC_SUPABASE_* from apps/web/.env.local; FLUENT_API_URL defaults to APP_URL
FLUENT_API_URL=https://your-app.vercel.app npm run build:extension
```
Open `chrome://extensions`, enable Developer mode, **Load unpacked**, and pick `apps/extension/dist`. Click the Fluent icon to open the side panel. Clicking the icon is also what grants it access to the current tab; if you switch tabs, click the icon again.

## Not built yet

- PDF attachments aren't read (Fluent sees attachment names, not contents). Briefs sent as PDFs need a text-extraction step.
- No Deals or Library tabs; chat and Ideas only.
- The Ideas list is cached in memory for 10 minutes per server instance.
- The extension signs in with email + password; there's no sign-up in the panel.
- No automated test suite yet. The server was verified with `tsc`, a production build and a scripted agent-loop check, but not against live Supabase, Google or Airtable accounts.
