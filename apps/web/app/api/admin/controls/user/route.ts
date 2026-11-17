import { handle, HttpError, json, options } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { findUserByEmail } from "@/lib/admin/users";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

/** Pause or resume Fluent for one account. */
export const POST = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const { email, paused, note } = await req.json();
  const u = await findUserByEmail(String(email ?? ""));
  if (!u) throw new HttpError(404, "No user with that email.");
  await admin().from("settings").upsert({ user_id: u.id, paused: !!paused, paused_note: paused ? String(note ?? "").slice(0, 200) || null : null }, { onConflict: "user_id" });
  await audit(me, paused ? "user_pause" : "user_resume", u.email ?? u.id, { note });
  return json({ ok: true, userId: u.id });
});

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const { data } = await admin().from("settings").select("user_id,gmail_email,paused,paused_note").eq("paused", true);
  return json({ paused: data ?? [] });
});
