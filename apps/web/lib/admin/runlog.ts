import { admin } from "../supabase-admin";
import { costOf } from "./cost";
import { getFlags, setFlag } from "./flags";
import { audit } from "./auth";

export type RunKind = "classify" | "draft" | "ask" | "refine";
export type RunSource = "live" | "eval" | "reprocess";

type Usage = { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } | undefined;

export type RunRecord = {
  userId?: string | null;
  kind: RunKind;
  source?: RunSource;
  promptKey?: string;
  promptVersion?: number | null;
  model: string;
  input: unknown;
  output?: unknown;
  error?: string;
  usage?: Usage;
  startedAt: number;
};

const clip = (v: unknown, max = 60_000) => {
  if (v === undefined) return null;
  const s = JSON.stringify(v);
  return s.length > max ? { truncated: true, preview: s.slice(0, max) } : v;
};

/** Writes one row per model call. It never throws: logging must not break the agent. Returns the run id. */
export async function logRun(r: RunRecord): Promise<{ id: string | null; costUsd: number | null }> {
  try {
    const inTok = r.usage?.inputTokens ?? r.usage?.promptTokens ?? null;
    const outTok = r.usage?.outputTokens ?? r.usage?.completionTokens ?? null;
    const flags = await getFlags();
    const cost = costOf(r.model, inTok, outTok, flags.model_prices);
    const { data } = await admin()
      .from("agent_runs")
      .insert({
        user_id: r.userId ?? null, kind: r.kind, source: r.source ?? "live", prompt_key: r.promptKey ?? null, prompt_version: r.promptVersion ?? null,
        model: r.model, input: clip(r.input), output: clip(r.output), error: r.error ?? null, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, latency_ms: Date.now() - r.startedAt,
      })
      .select("id")
      .single();
    if (r.error && (r.source ?? "live") === "live") void maybeAutoPause(flags.auto_pause_errors);
    return { id: (data?.id as string) ?? null, costUsd: cost };
  } catch (e) {
    console.error("run log failed", e instanceof Error ? e.message : e);
    return { id: null, costUsd: null };
  }
}

/** If live errors pile up in 10 minutes, pause the agent so a bad prompt or outage doesn't keep running. Off when the threshold is 0. */
async function maybeAutoPause(threshold: number) {
  if (!threshold) return;
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await admin().from("agent_runs").select("id", { count: "exact", head: true }).eq("source", "live").not("error", "is", null).gte("created_at", since);
  if ((count ?? 0) >= threshold && !(await getFlags(true)).pause_agent) {
    await setFlag("pause_agent", true);
    await audit(null, "auto_pause", "pause_agent", { errorsIn10Min: count, threshold });
  }
}

export const modelId = () => process.env.FLUENT_MODEL || "anthropic:claude-sonnet-5-5";
