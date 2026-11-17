import { handle, json, options } from "@/lib/http";
import { requireAdmin } from "@/lib/admin/auth";
import { getFlags } from "@/lib/admin/flags";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const db = admin();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [runs, lastEval, recent, flags] = await Promise.all([
    db.from("agent_runs").select("kind,error,latency_ms,cost_usd,input_tokens,output_tokens").eq("source", "live").gte("created_at", since).limit(5000),
    db.from("eval_runs").select("id,started_at,status,total,passed,flaky,repeats,prompts,model").eq("status", "done").order("started_at", { ascending: false }).limit(1),
    db.from("agent_runs").select("id,kind,created_at,error,latency_ms,model,prompt_key,prompt_version").eq("source", "live").order("created_at", { ascending: false }).limit(8),
    getFlags(true),
  ]);
  const r = runs.data ?? [];
  const lat = r.map((x) => x.latency_ms as number).filter((n) => n != null).sort((a, b) => a - b);
  const byKind: Record<string, { n: number; errors: number }> = {};
  for (const x of r) {
    const k = (byKind[x.kind as string] ??= { n: 0, errors: 0 });
    k.n++;
    if (x.error) k.errors++;
  }
  const e = lastEval.data?.[0];
  return json({
    last24h: {
      runs: r.length,
      errors: r.filter((x) => x.error).length,
      p50Ms: lat.length ? lat[Math.floor(lat.length / 2)] : null,
      p95Ms: lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : null,
      costUsd: r.some((x) => x.cost_usd != null) ? r.reduce((a, x) => a + Number(x.cost_usd ?? 0), 0) : null,
      byKind,
    },
    lastEval: e ? { ...e, cases: Math.round((e.total as number) / ((e.repeats as number) || 1)) } : null,
    recent: recent.data ?? [],
    flags,
  });
});
