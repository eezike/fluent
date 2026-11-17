import { handle, json, options } from "@/lib/http";
import { requireAdmin } from "@/lib/admin/auth";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 30), 1), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await admin().from("feedback_events").select("id,notif_type,event,edited,detail,run_id,created_at,user_id").gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
  const rows = data ?? [];
  const types: Record<string, { approved: number; edited: number; dismissed: number; snoozed: number; refined: number }> = {};
  for (const r of rows) {
    const t = (types[r.notif_type ?? "unknown"] ??= { approved: 0, edited: 0, dismissed: 0, snoozed: 0, refined: 0 });
    t[r.event as "approved"]++;
    if (r.event === "approved" && r.edited) t.edited++;
  }
  const summary = Object.entries(types).map(([type, c]) => {
    const decided = c.approved + c.dismissed;
    return { type, ...c, approveRate: decided ? c.approved / decided : null, editRate: c.approved ? c.edited / c.approved : null };
  });
  const interesting = rows.filter((r) => r.event === "dismissed" || r.event === "refined" || r.edited).slice(0, 40);
  return json({ days, total: rows.length, summary, recent: interesting });
});
