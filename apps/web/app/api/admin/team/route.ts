import { handle, HttpError, json, options } from "@/lib/http";
import { audit, clearAdminCache, requireAdmin } from "@/lib/admin/auth";
import { findUserByEmail } from "@/lib/admin/users";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const [a, log] = await Promise.all([
    admin().from("admins").select("user_id,email,created_at").order("created_at"),
    admin().from("admin_audit").select("id,actor_email,action,target,detail,created_at").order("created_at", { ascending: false }).limit(60),
  ]);
  return json({ admins: a.data ?? [], audit: log.data ?? [] });
});

export const POST = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const { email } = await req.json();
  const u = await findUserByEmail(String(email ?? ""));
  if (!u) throw new HttpError(404, "That person needs to sign in to Fluent once before they can be made an admin.");
  await admin().from("admins").upsert({ user_id: u.id, email: u.email }, { onConflict: "user_id" });
  clearAdminCache();
  await audit(me, "admin_add", u.email ?? u.id);
  return json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const { userId } = await req.json();
  if (userId === me.id) throw new HttpError(400, "You can't remove yourself. Ask the other admin.");
  const { count } = await admin().from("admins").select("user_id", { count: "exact", head: true });
  if ((count ?? 0) <= 1) throw new HttpError(400, "There has to be at least one admin.");
  await admin().from("admins").delete().eq("user_id", userId);
  clearAdminCache();
  await audit(me, "admin_remove", userId);
  return json({ ok: true });
});
