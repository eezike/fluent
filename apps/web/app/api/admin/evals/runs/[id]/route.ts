import { handle, HttpError, json, options } from "@/lib/http";
import { requireAdmin } from "@/lib/admin/auth";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req);
  const { id } = await params;
  const db = admin();
  const { data: run } = await db.from("eval_runs").select("*").eq("id", id).maybeSingle();
  if (!run) throw new HttpError(404, "Run not found");
  const { data: results } = await db.from("eval_results").select("*").eq("run_id", id).order("case_name").order("repeat");
  return json({ run, results: results ?? [] });
});
