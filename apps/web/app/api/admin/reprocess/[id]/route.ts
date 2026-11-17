import { handle, HttpError, json, options } from "@/lib/http";
import { requireAdmin } from "@/lib/admin/auth";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req);
  const { id } = await params;
  const { data: job } = await admin().from("reprocess_jobs").select("*").eq("id", id).maybeSingle();
  if (!job) throw new HttpError(404, "Job not found");
  const { data: results } = await admin().from("reprocess_results").select("*").eq("job_id", id).order("changed_fields", { ascending: false }).limit(200);
  return json({ job, results: results ?? [] });
});
