import { handle, HttpError, json, options } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const POST = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const b = await req.json();
  if (!b.suiteId || !b.name || !["classify", "plan"].includes(b.kind)) throw new HttpError(400, "A case needs a suite, a name and a kind.");
  const { data, error } = await admin().from("eval_cases").insert({ suite_id: b.suiteId, name: String(b.name).slice(0, 120), kind: b.kind, input: b.input ?? {}, checks: b.checks ?? [], created_by: me.id }).select("id").single();
  if (error) throw new Error(error.message);
  await audit(me, "eval_case_create", data.id);
  return json({ id: data.id });
});
