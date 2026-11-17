import { admin } from "../supabase-admin";
import { classifyEmail } from "../sync/classify";
import { promptForEval } from "./prompts";
import { modelId } from "./runlog";

export const COMPARE_FIELDS = ["kind", "brand", "fee", "currency", "deliverables", "usageMonths", "exclusivity", "exclusivityUntil", "contentDue", "postStart", "postEnd", "paymentTerms", "paymentNetDays"] as const;

export const changedFields = (before: any, after: any): string[] =>
  COMPARE_FIELDS.filter((f) => JSON.stringify(before?.[f] ?? null) !== JSON.stringify(after?.[f] ?? null));

type Prompt = { pick?: string | number; text?: string };

export async function startReprocess(o: { days: number; limit: number; prompt: Prompt; model?: string | null; by?: string }): Promise<string> {
  const db = admin();
  const since = new Date(Date.now() - o.days * 86_400_000).toISOString();
  const { count } = await db.from("agent_runs").select("id", { count: "exact", head: true }).eq("kind", "classify").eq("source", "live").is("error", null).gte("created_at", since);
  const total = Math.min(count ?? 0, o.limit);
  const { data, error } = await db.from("reprocess_jobs").insert({ prompt: o.prompt, model: o.model || null, days: o.days, total, created_by: o.by ?? null }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Re-reads past emails with another prompt and records what would change. It never touches notifications or any user's tools. */
export async function executeReprocess(jobId: string): Promise<void> {
  const db = admin();
  try {
    const { data: job } = await db.from("reprocess_jobs").select("*").eq("id", jobId).single();
    if (!job) return;
    const since = new Date(Date.now() - (job.days as number) * 86_400_000).toISOString();
    const { data: runs } = await db.from("agent_runs").select("id,input,output").eq("kind", "classify").eq("source", "live").is("error", null).gte("created_at", since).order("created_at", { ascending: false }).limit(job.total as number);
    const usable = (runs ?? []).filter((r) => (r.input as any)?.email && r.output && !(r.output as any).truncated);
    const p = job.prompt as Prompt;
    const resolved = p.text != null ? { text: p.text, version: null } : await promptForEval("classify", p.pick);
    let done = 0;
    let changed = 0;
    let next = 0;
    const worker = async () => {
      while (next < usable.length) {
        const r = usable[next++];
        let after: any = null;
        let err: string | null = null;
        try {
          after = await classifyEmail((r.input as any).email, { system: resolved.text, promptVersion: resolved.version, model: job.model ?? modelId(), source: "reprocess" });
        } catch (e) {
          err = e instanceof Error ? e.message : "failed";
        }
        const diff = after ? changedFields(r.output, after) : [];
        if (diff.length) changed++;
        await db.from("reprocess_results").insert({ job_id: jobId, source_run_id: r.id, before: r.output, after, changed_fields: diff, error: err });
        done++;
        await db.from("reprocess_jobs").update({ done, changed }).eq("id", jobId);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await db.from("reprocess_jobs").update({ status: "done", done, changed, total: usable.length, finished_at: new Date().toISOString() }).eq("id", jobId);
  } catch (e) {
    await db.from("reprocess_jobs").update({ status: "failed", error: e instanceof Error ? e.message : "failed", finished_at: new Date().toISOString() }).eq("id", jobId);
  }
}
