import { handle, json, options } from "@/lib/http";
import { requireAdmin } from "@/lib/admin/auth";
import { syncHealth } from "@/lib/admin/health";
import { optionalEnv } from "@/lib/env";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const db = admin();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [u, s, c, n, e] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db.from("settings").select("*"),
    db.from("connections").select("user_id,provider"),
    db.from("notifications").select("user_id,status").in("status", ["open", "running"]).limit(20000),
    db.from("agent_runs").select("user_id").eq("source", "live").not("error", "is", null).gte("created_at", since).limit(20000),
  ]);
  const pushConfigured = !!optionalEnv("GMAIL_PUBSUB_TOPIC");
  const count = (rows: { user_id: string | null }[] | null, id: string) => (rows ?? []).filter((r) => r.user_id === id).length;
  const users = (u.data?.users ?? []).map((x) => {
    const st = (s.data ?? []).find((r) => r.user_id === x.id) ?? {};
    const conns = (c.data ?? []).filter((r) => r.user_id === x.id).map((r) => r.provider as string);
    return {
      id: x.id,
      email: x.email ?? null,
      createdAt: x.created_at,
      lastSignInAt: x.last_sign_in_at ?? null,
      onboarded: !!(st as any).onboarded_at,
      paused: !!(st as any).paused,
      sourceOfTruth: (st as any).source_of_truth ?? null,
      gmailEmail: (st as any).gmail_email ?? null,
      lastSyncAt: (st as any).last_sync_at ?? null,
      watchExpiresAt: (st as any).gmail_watch_expires_at ?? null,
      lastPushAt: (st as any).last_push_at ?? null,
      connections: conns,
      open: count(n.data, x.id),
      errors24h: count(e.data, x.id),
      health: syncHealth(st as any, { google: conns.includes("google"), pushConfigured }),
    };
  });
  users.sort((a, b) => (a.health.level === "ok" ? 1 : 0) - (b.health.level === "ok" ? 1 : 0) || (b.lastSignInAt ?? "").localeCompare(a.lastSignInAt ?? ""));
  return json({ users, pushConfigured });
});
