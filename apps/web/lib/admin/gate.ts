import { admin } from "../supabase-admin";
import { getFlags } from "./flags";

/** Has this prompt version passed the eval gate? Uses the newest finished run that tested exactly this version. */
export async function gateStatus(key: string, version: number) {
  const gate = (await getFlags()).promote_gate;
  const { data } = await admin().from("eval_runs").select("id,total,repeats,passed,prompts,suite_id,started_at").eq("status", "done").is("suite_id", null).order("started_at", { ascending: false }).limit(50);
  const run = (data ?? []).find((r) => String((r.prompts as Record<string, unknown>)?.[key]) === String(version));
  if (!run) return { ok: false, gate, rate: null as number | null, runId: null as string | null, reason: `Run all evals with version ${version} first.` };
  const cases = (run.total as number) / ((run.repeats as number) || 1);
  const rate = cases ? (run.passed as number) / cases : 0;
  return { ok: rate >= gate, gate, rate, runId: run.id as string, reason: rate >= gate ? "" : `Pass rate ${Math.round(rate * 100)}% is below the ${Math.round(gate * 100)}% gate.` };
}
