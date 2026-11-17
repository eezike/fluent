import { handle, HttpError, json, options } from "@/lib/http";
import { requireAdmin } from "@/lib/admin/auth";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req);
  const { id } = await params;
  const { data } = await admin().from("agent_runs").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Run not found");
  return json({ run: data });
});
