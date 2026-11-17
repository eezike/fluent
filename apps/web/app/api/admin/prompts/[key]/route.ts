import { handle, HttpError, json, options } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { PROMPT_KEYS } from "@/lib/admin/defaults";
import { gateStatus } from "@/lib/admin/gate";
import { clearPromptCache } from "@/lib/admin/prompts";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

type Body =
  | { action: "save"; body: string; note?: string }
  | { action: "rollout"; version: number; mode: "off" | "admins" | "percent"; percent?: number; force?: boolean }
  | { action: "promote"; version: number; force?: boolean }
  | { action: "rollback"; version?: number | null };

/** Saving never changes what users get. Rollout, promote and rollback do, and every one is audited. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ key: string }> }) => {
  const me = await requireAdmin(req);
  const { key } = await params;
  if (!(PROMPT_KEYS as string[]).includes(key)) throw new HttpError(404, "Unknown prompt");
  const b = (await req.json()) as Body;
  const db = admin();
  const touch = () => clearPromptCache();

  if (b.action === "save") {
    const text = (b.body ?? "").trim();
    if (text.length < 40) throw new HttpError(400, "That prompt is too short to be real.");
    if (text.length > 20_000) throw new HttpError(400, "Prompts are limited to 20,000 characters.");
    const { data: last } = await db.from("prompt_versions").select("version").eq("key", key).order("version", { ascending: false }).limit(1);
    const version = ((last?.[0]?.version as number) ?? 0) + 1;
    const { error } = await db.from("prompt_versions").insert({ key, version, body: text, note: b.note?.slice(0, 200) ?? null, created_by: me.id });
    if (error) throw new Error(error.message);
    await audit(me, "prompt_save", key, { version });
    touch();
    return json({ version });
  }

  const exists = async (v: number) => {
    const { data } = await db.from("prompt_versions").select("version").eq("key", key).eq("version", v).maybeSingle();
    if (!data) throw new HttpError(404, `No version ${v}.`);
  };
  const { data: cur } = await db.from("prompt_rollout").select("*").eq("key", key).maybeSingle();
  const base = cur ?? { key, active_version: null, candidate_version: null, mode: "off", percent: 0 };

  if (b.action === "rollout") {
    await exists(b.version);
    const percent = Math.min(100, Math.max(0, Math.round(b.percent ?? 0)));
    if (b.mode === "percent") {
      const g = await gateStatus(key, b.version);
      if (!g.ok && !b.force) throw new HttpError(409, g.reason);
    }
    const next = b.mode === "off" ? { candidate_version: null, mode: "off", percent: 0 } : { candidate_version: b.version, mode: b.mode, percent: b.mode === "percent" ? percent : 0 };
    await db.from("prompt_rollout").upsert({ ...base, ...next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    await audit(me, "prompt_rollout", key, { version: b.version, ...next, forced: !!b.force });
  } else if (b.action === "promote") {
    await exists(b.version);
    const g = await gateStatus(key, b.version);
    if (!g.ok && !b.force) throw new HttpError(409, g.reason);
    await db.from("prompt_rollout").upsert({ ...base, active_version: b.version, candidate_version: null, mode: "off", percent: 0, updated_at: new Date().toISOString() }, { onConflict: "key" });
    await audit(me, "prompt_promote", key, { version: b.version, from: base.active_version, forced: !!b.force });
  } else if (b.action === "rollback") {
    const to = b.version ?? null;
    if (to != null) await exists(to);
    await db.from("prompt_rollout").upsert({ ...base, active_version: to, candidate_version: null, mode: "off", percent: 0, updated_at: new Date().toISOString() }, { onConflict: "key" });
    await audit(me, "prompt_rollback", key, { to, from: base.active_version });
  } else throw new HttpError(400, "Unknown action");
  touch();
  return json({ ok: true });
});
