import { handle, HttpError, json, options } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { ensureWatch } from "@/lib/sync/watch";
import { syncUser } from "@/lib/sync";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 120;
export const OPTIONS = options;
type P = { params: Promise<{ id: string }> };

/** Read-only look at what a user sees. Titles and statuses only, no email text. Every look is logged. */
export const GET = handle(async (req: Request, { params }: P) => {
  const me = await requireAdmin(req);
  const { id } = await params;
  const db = admin();
  const { data: u } = await db.auth.admin.getUserById(id);
  if (!u?.user) throw new HttpError(404, "User not found");
  const [n, t] = await Promise.all([
    db.from("notifications").select("id,type,status,title,error,created_at,updated_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("todos").select("id,title,status,source,due_date").eq("user_id", id).in("status", ["open", "suggested"]).limit(50),
  ]);
  await audit(me, "view_user", u.user.email ?? id);
  return json({ email: u.user.email, notifications: n.data ?? [], todos: t.data ?? [] });
});

export const POST = handle(async (req: Request, { params }: P) => {
  const me = await requireAdmin(req);
  const { id } = await params;
  const { action } = await req.json();
  const db = admin();
  const { data: u } = await db.auth.admin.getUserById(id);
  const who = u?.user?.email ?? id;
  if (action === "sync") {
    const r = await syncUser(id, { minGapMs: 0 });
    await audit(me, "user_sync", who, r);
    return json({ result: r });
  }
  if (action === "renew_watch") {
    await ensureWatch(id, { force: true });
    await audit(me, "user_renew_watch", who);
    return json({ ok: true });
  }
  if (action === "pause" || action === "resume") {
    await db.from("settings").upsert({ user_id: id, paused: action === "pause" }, { onConflict: "user_id" });
    await audit(me, `user_${action}`, who);
    return json({ ok: true });
  }
  throw new HttpError(400, "Unknown action");
});
