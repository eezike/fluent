# Fluent

An agent for brand-deal workflows. It watches your Gmail, checks offers against your rate card and past deals, and turns what it finds into **notifications** you act on in one tap: *New opportunity*, *Attention required*, *Money*, *Informational*. Each one shows the **Changes** it proposes, the **Sources** it used, the terms it found, and its **Steps**. It drafts freely, but sends only after you approve, and it never deletes.

- **`apps/web`**: Next.js PWA + API. Deploys to Vercel.
- **`apps/extension`**: Chrome side-panel extension. Same UI, plus "On this page" for the tab you're on.
- **`packages/ui`**: the React UI both apps render, so they look the same.
- **`packages/shared`**: wire types and the small fetch client.
- **`supabase/migrations`**: schema (`0001` base, `0002` notifications/deals/jobs).

## How it works

- **Inbox sync.** Gmail pushes new mail through Pub/Sub to `/api/webhooks/gmail` (primary). `/api/sync` also runs when an app opens or regains focus, and `/api/cron/sync` runs every 15 minutes as a safety net: it renews the Gmail watch (it expires after ~7 days), runs date alerts and catches missed pushes. New threads are classified, offers are compared to your recent deals (rate flag below 85% of your average, exclusivity conflicts), and a notification with a ready plan is created.
- **Date alerts.** "Payment overdue" and "Usage rights ending soon" come from your deals table, a cache of your **source of truth** (Airtable or Sheets). If both are connected and none is chosen, Fluent asks you in a notification.
- **Approve → job.** Approving claims the notification, then runs its actions in order (Calendar hold, deal row, Gmail draft or send). Failures return it to open with the error; retries skip finished actions. You can edit email drafts before approving.
- **Small chat.** The bottom bar takes a question (**Answer**, read-only) or a task (**Do it**). Inside a notification, "Reply or refine this task…" edits the draft.
- **Model-agnostic.** `FLUENT_MODEL=<provider>:<model>` (default `anthropic:claude-sonnet-5-5`) plus that provider's key.
- **Safety.** Email, sheet and page text is untrusted data. The only outbound action is a send from an approved job. Connector tokens are AES-256-GCM encrypted and server-only.

## Setup

1. **Supabase.** Create a project and run `0001_init.sql` then `0002_notifications.sql` in the SQL editor.
2. **Google.** Enable the Gmail, Google Sheets and Google Calendar APIs; create a Web OAuth client with redirect `<APP_URL>/api/connectors/google/callback`. Scopes now include Calendar events and Sheets write, so existing users must disconnect and reconnect Google.
3. **Airtable / Sheets.** Add them in the Connectors sheet (Airtable token with `data.records:read/write`, `schema.bases:read`; a Sheets tab named `Deals` with a header row).
4. **Env.** `cp apps/web/.env.example apps/web/.env.local` and fill it in (`openssl rand -base64 32` for `ENCRYPTION_KEY`).
5. **Run.** `npm install && npm run dev`.
6. **Deploy.** Vercel with Root Directory `apps/web`. `vercel.json` schedules the 15-minute cron; Vercel Hobby only allows daily crons, so on Hobby call `/api/cron/sync` with `Authorization: Bearer $CRON_SECRET` from an external scheduler. Without Pub/Sub, run the cron every minute instead.
7. **Pub/Sub push.** Set `GMAIL_PUBSUB_TOPIC` (`projects/<id>/topics/<name>`) and `GMAIL_PUSH_TOKEN`. Grant `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher role on the topic, and point a push subscription at `<APP_URL>/api/webhooks/gmail?token=<GMAIL_PUSH_TOKEN>`.
8. **Extension.** `FLUENT_API_URL=https://your-app.vercel.app npm run build:extension`, then load `apps/extension/dist` unpacked in `chrome://extensions`.

## Tests

`cd apps/web && npx tsx --test test/core.test.ts` covers the pure deal logic (rate flags, exclusivity, counters, date rules, sheet mapping, quote checks).

## Not verified / not built

- Never run against live Supabase, Google or Airtable; the LLM classify and draft paths are untested live. Only the pure logic has tests.
- PDF attachments aren't read.
- Inter is used; the Ramp reference font is licensed and not embedded.
- The extension reads Gmail tabs automatically; other tabs need a click on the toolbar icon.
