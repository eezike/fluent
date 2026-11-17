import { optionalEnv } from "../env";
import { getConnection } from "../connections";
import { getSettings, updateSettings } from "../settings";
import { watchInbox } from "../connectors/gmail";

/**
 * Optional real-time path: Gmail pushes to a Pub/Sub topic, which calls /api/webhooks/gmail.
 * Without GMAIL_PUBSUB_TOPIC, near-real-time comes from the one-minute cron plus a sync whenever an app opens.
 */
export async function ensureWatch(userId: string): Promise<void> {
  const topic = optionalEnv("GMAIL_PUBSUB_TOPIC");
  if (!topic || !(await getConnection(userId, "google"))) return;
  const s = await getSettings(userId);
  if (s.gmail_watch_expires_at && Date.parse(s.gmail_watch_expires_at) - Date.now() > 24 * 3600_000) return;
  const w = await watchInbox(userId, topic);
  await updateSettings(userId, { gmail_watch_expires_at: new Date(w.expiration).toISOString() });
}
