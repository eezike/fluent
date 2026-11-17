import { admin } from "../supabase-admin";
import { classifyEmail } from "../sync/classify";
import { planOffer, type Extraction } from "../core/plan";
import type { DealLite } from "../core/rules";
import { runChecks, type Check, type CheckResult } from "./checks";
import { promptForEval } from "./prompts";
import { PROMPT_KEYS, type PromptKey } from "./defaults";
import { modelId } from "./runlog";

export type EvalCase = { id: string; suite_id: string; name: string; kind: "classify" | "plan"; input: any; checks: Check[] };
type Pick = string | number;

/** What a plan looks like to a check: flat, so "actionKinds not_contains gmail.send" reads naturally. */
export function flattenPlan(p: ReturnType<typeof planOffer>) {
  return {
    type: p.type,
    category: p.category,
    urgency: p.urgency,
    title: p.title,
    flagTitles: p.flags.map((f) => f.title),
    actionKinds: p.actions.map((a) => a.kind),
    actionSummaries: p.actions.map((a) => a.summary),
    changeTexts: p.changes.map((c) => c.text),
    primaryLabel: p.primaryLabel,
  };
}

async function runCase(c: EvalCase, prompts: Record<string, Pick>, model: string | undefined) {
  const started = Date.now();
  let costUsd: number | null = null;
  try {
    if (c.kind === "plan") {
      const i = c.input as { x: Extraction; deals: DealLite[]; today: string; sot?: "airtable" | "sheets" | null; subject?: string };
      const out = flattenPlan(planOffer({ x: i.x, deals: i.deals ?? [], today: i.today, sot: i.sot ?? "airtable", subject: i.subject ?? "Partnership", acceptBody: "(accept draft)", counterBody: () => "(counter draft)" }));
      return { output: out, results: runChecks(c.checks, out, ""), error: null as string | null, ms: Date.now() - started, costUsd };
    }
    const p = await promptForEval("classify", prompts.classify);
    const i = c.input as { from: string; subject: string; text: string; attachments?: string; today: string };
    const out = await classifyEmail(i, { system: p.text, promptVersion: p.version, model, source: "eval", report: (r) => (costUsd = r.costUsd) });
    return { output: out, results: runChecks(c.checks, out, `${i.text}\n${i.attachments ?? ""}`), error: null, ms: Date.now() - started, costUsd };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return { output: null, results: [] as CheckResult[], error: msg, ms: Date.now() - started, costUsd };
  }
}

export async function startEvalRun(o: { suiteId?: string | null; prompts?: Record<string, Pick>; model?: string | null; repeats?: number; by?: string }): Promise<string> {
  const db = admin();
  let q = db.from("eval_cases").select("id", { count: "exact", head: true });
  if (o.suiteId) q = q.eq("suite_id", o.suiteId);
  const { count } = await q;
  const repeats = Math.min(Math.max(o.repeats ?? 1, 1), 5);
  const prompts: Record<string, Pick> = {};
  for (const k of PROMPT_KEYS) if (o.prompts?.[k] != null) prompts[k] = o.prompts[k];
  const { data, error } = await db
    .from("eval_runs")
    .insert({ suite_id: o.suiteId ?? null, prompts, model: o.model || null, repeats, total: (count ?? 0) * repeats, created_by: o.by ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Runs every case `repeats` times, three at a time. Safe to call from after(): it records failure instead of throwing. */
export async function executeEvalRun(runId: string): Promise<void> {
  const db = admin();
  try {
    const { data: run } = await db.from("eval_runs").select("*").eq("id", runId).single();
    if (!run) return;
    let q = db.from("eval_cases").select("*").order("created_at");
    if (run.suite_id) q = q.eq("suite_id", run.suite_id);
    const { data: cases } = await q;
    const jobs = (cases ?? []).flatMap((c) => Array.from({ length: run.repeats as number }, (_, r) => ({ c: c as EvalCase, r })));
    const byCase = new Map<string, boolean[]>();
    let done = 0;
    let cost = 0;
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const { c, r } = jobs[next++];
        const res = await runCase(c, (run.prompts ?? {}) as Record<string, Pick>, run.model ?? undefined);
        const pass = !res.error && res.results.length > 0 && res.results.every((x) => x.pass);
        byCase.set(c.id, [...(byCase.get(c.id) ?? []), pass]);
        cost += res.costUsd ?? 0;
        await db.from("eval_results").insert({ run_id: runId, case_id: c.id, case_name: c.name, repeat: r, pass, checks: res.results, output: res.output, error: res.error, latency_ms: res.ms, cost_usd: res.costUsd });
        done++;
        await db.from("eval_runs").update({ done }).eq("id", runId);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const outcomes = [...byCase.values()];
    await db
      .from("eval_runs")
      .update({
        status: "done",
        done,
        passed: outcomes.filter((o) => o.every(Boolean)).length,
        flaky: outcomes.filter((o) => o.some(Boolean) && !o.every(Boolean)).length,
        total: jobs.length,
        cost_usd: cost || null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch (e) {
    await db.from("eval_runs").update({ status: "failed", error: e instanceof Error ? e.message : "failed", finished_at: new Date().toISOString() }).eq("id", runId);
  }
}

export const defaultEvalModel = modelId;
export type { PromptKey };
