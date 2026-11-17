import { handle, HttpError, json } from "@/lib/http";
import { optionalEnv } from "@/lib/env";
import { admin } from "@/lib/supabase-admin";
import { syncUser } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Safety net, not the main path: renews Gmail watches, runs date alerts and catches missed pushes.
 * Every 15 minutes is plenty with Pub/Sub (vercel.json, or any external scheduler); use every minute without it.
 * Authenticated with CRON_SECRET.
 */
export const GET = handle(async (req: Request) => {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  const { data } = await admin().from("connections").select("user_id").eq("provider", "google");
  const ids = [...new Set((data ?? []).map((r) => r.user_id as string))];
  let created = 0;
  const errors: string[] = [];
  // Small batches keep one slow mailbox from delaying the rest.
  for (let i = 0; i < ids.length; i += 5) {
    const results = await Promise.all(ids.slice(i, i + 5).map((id) => syncUser(id, { minGapMs: 30_000 })));
    for (const r of results) {
      created += r.created;
      errors.push(...r.errors);
    }
  }
  return json({ users: ids.length, created, errors: errors.slice(0, 10) });
});
