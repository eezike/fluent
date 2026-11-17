export type Health = { level: "ok" | "warn" | "bad" | "idle"; label: string };

/** One line per user on the Users page: is Fluent keeping up with their inbox? */
export function syncHealth(s: { paused?: boolean; gmail_watch_expires_at?: string | null; last_sync_at?: string | null }, o: { google: boolean; pushConfigured: boolean; now?: number }): Health {
  const now = o.now ?? Date.now();
  if (!o.google) return { level: "idle", label: "Google not connected" };
  if (s.paused) return { level: "warn", label: "Paused" };
  if (o.pushConfigured) {
    if (!s.gmail_watch_expires_at) return { level: "warn", label: "No push watch yet" };
    const left = Date.parse(s.gmail_watch_expires_at) - now;
    if (left <= 0) return { level: "bad", label: "Push watch expired" };
    if (left < 24 * 3600_000) return { level: "warn", label: "Push watch expiring" };
  }
  if (!s.last_sync_at) return { level: "warn", label: "Never synced" };
  if (now - Date.parse(s.last_sync_at) > 2 * 3600_000) return { level: "warn", label: "Sync is stale" };
  return { level: "ok", label: "Healthy" };
}
