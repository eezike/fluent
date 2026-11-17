import { handle, HttpError, json, options } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { CHECK_LABELS } from "@/lib/admin/checks";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;
type P = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: P) => {
  await requireAdmin(req);
  const { id } = await params;
  const db = admin();
  const { data } = await db.from("eval_cases").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Case not found");
  const { data: hist } = await db.from("eval_results").select("run_id,pass,repeat,eval_runs(started_at)").eq("case_id", id).limit(40);
  return json({ case: data, history: hist ?? [] });
});

export const PUT = handle(async (req: Request, { params }: P) => {
  const me = await requireAdmin(req);
  const { id } = await params;
  const b = await req.json();
  const checks = Array.isArray(b.checks) ? b.checks : [];
  for (const c of checks) if (!c.field || !(c.type in CHECK_LABELS)) throw new HttpError(400, "Every check needs a field and a valid type.");
  const { error } = await admin().from("eval_cases").update({ name: String(b.name).slice(0, 120), input: b.input, checks, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(me, "eval_case_update", id);
  return json({ ok: true });
});

export const DELETE = handle(async (req: Request, { params }: P) => {
  const me = await requireAdmin(req);
  const { id } = await params;
  await admin().from("eval_cases").delete().eq("id", id);
  await audit(me, "eval_case_delete", id);
  return json({ ok: true });
});
