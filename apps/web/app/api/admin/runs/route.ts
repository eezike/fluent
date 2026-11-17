import { handle, json, options } from "@/lib/http";
import { requireAdmin } from "@/lib/admin/auth";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind");
  const source = u.searchParams.get("source");
  const before = u.searchParams.get("before");
  let q = admin().from("agent_runs").select("id,kind,source,user_id,prompt_key,prompt_version,model,error,latency_ms,cost_usd,input_tokens,output_tokens,created_at").order("created_at", { ascending: false }).limit(50);
  if (kind) q = q.eq("kind", kind);
  if (source) q = q.eq("source", source);
  if (u.searchParams.get("errors") === "1") q = q.not("error", "is", null);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return json({ runs: data });
});
