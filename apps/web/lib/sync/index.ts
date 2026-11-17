import type { SyncResult } from "@fluent/shared";
import { admin } from "../supabase-admin";
import { getSettings } from "../settings";
import { importDeals } from "./source";
import { runDateChecks } from "./dates";
import { syncInbox } from "./inbox";
import { ensureWatch } from "./watch";
import { agentActive } from "../admin/flags";

/** One sync claims the user for a few seconds so a burst of triggers (push + cron + app open) runs once. */
async function claim(userId: string, minGapMs: number): Promise<boolean> {
  await getSettings(userId);
  const cutoff = new Date(Date.now() - minGapMs).toISOString();
  const { data } = await admin()
    .from("settings")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId)
    .or(`last_sync_at.is.null,last_sync_at.lt.${cutoff}`)
    .select("user_id");
  return !!data?.length;
}

export async function syncUser(userId: string, opts: { minGapMs?: number } = {}): Promise<SyncResult> {
  if (!(await agentActive(userId))) return { created: 0, errors: [], skipped: true };
  if (!(await claim(userId, opts.minGapMs ?? 15_000))) return { created: 0, errors: [], skipped: true };
  const errors: string[] = [];
  let created = 0;
  const step = async (name: string, fn: () => Promise<number | void>) => {
    try {
      created += (await fn()) || 0;
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  };
  await step("deals", () => importDeals(userId));
  await step("inbox", () => syncInbox(userId));
  await step("dates", () => runDateChecks(userId));
  await step("watch", () => ensureWatch(userId));
  return { created, errors };
}
