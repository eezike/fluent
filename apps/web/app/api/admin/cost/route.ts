import { handle, json, options } from "@/lib/http";
import { requireAdmin } from "@/lib/admin/auth";
import { getFlags } from "@/lib/admin/flags";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

const bump = (m: Record<string, { cost: number; runs: number; inTok: number; outTok: number }>, k: string, r: any) => {
  const x = (m[k] ??= { cost: 0, runs: 0, inTok: 0, outTok: 0 });
  x.cost += Number(r.cost_usd ?? 0);
  x.runs++;
  x.inTok += r.input_tokens ?? 0;
  x.outTok += r.output_tokens ?? 0;
};

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 14), 1), 90);
  const db = admin();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [runs, evals, flags] = await Promise.all([
    db.from("agent_runs").select("kind,source,model,prompt_key,prompt_version,cost_usd,input_tokens,output_tokens,created_at").gte("created_at", since).limit(30000),
    db.from("eval_runs").select("model,total,repeats,passed,cost_usd,started_at").eq("status", "done").order("started_at", { ascending: false }).limit(200),
    getFlags(true),
  ]);
  const byDay: Record<string, { live: number; other: number }> = {};
  const byModel: Record<string, any> = {};
  const byKind: Record<string, any> = {};
  const byPrompt: Record<string, any> = {};
  let unpriced = 0;
  const today = new Date().toISOString().slice(0, 10);
  let todayLive = 0;
  for (const r of runs.data ?? []) {
    if (r.cost_usd == null) unpriced++;
    const d = (r.created_at as string).slice(0, 10);
    const day = (byDay[d] ??= { live: 0, other: 0 });
    if (r.source === "live") day.live += Number(r.cost_usd ?? 0);
    else day.other += Number(r.cost_usd ?? 0);
    if (d === today && r.source === "live") todayLive += Number(r.cost_usd ?? 0);
    bump(byModel, r.model ?? "unknown", r);
    bump(byKind, r.kind, r);
    if (r.prompt_key) bump(byPrompt, `${r.prompt_key} · ${r.prompt_version == null ? "default" : "v" + r.prompt_version}`, r);
  }
  const days_ = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10)).map((d) => ({ day: d, live: byDay[d]?.live ?? 0, other: byDay[d]?.other ?? 0 }));
  const models: Record<string, { runs: number; rate: number; cost: number }> = {};
  for (const e of evals.data ?? []) {
    const m = (e.model as string) || process.env.FLUENT_MODEL || "anthropic:claude-sonnet-5-5";
    const cases = (e.total as number) / ((e.repeats as number) || 1);
    const x = (models[m] ??= { runs: 0, rate: 0, cost: 0 });
    x.runs++;
    x.rate += cases ? (e.passed as number) / cases : 0;
    x.cost += Number(e.cost_usd ?? 0);
  }
  return json({
    days: days_,
    byModel,
    byKind,
    byPrompt,
    unpriced,
    total: days_.reduce((a, d) => a + d.live + d.other, 0),
    todayLive,
    budget: flags.daily_budget_usd,
    pricesSet: Object.keys(flags.model_prices).length > 0,
    modelCompare: Object.entries(models).map(([model, x]) => ({ model, runs: x.runs, avgPassRate: x.rate / x.runs, avgCost: x.cost / x.runs })),
  });
});
