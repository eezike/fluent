import { handle, json, options } from "@/lib/http";
import { requireAdmin } from "@/lib/admin/auth";
import { DEFAULT_PROMPTS, PROMPT_KEYS, PROMPT_META } from "@/lib/admin/defaults";
import { getFlags } from "@/lib/admin/flags";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const [v, r, runs, flags] = await Promise.all([
    admin().from("prompt_versions").select("key,version,body,note,created_at").order("version", { ascending: false }),
    admin().from("prompt_rollout").select("*"),
    admin().from("eval_runs").select("id,total,repeats,passed,prompts,started_at").eq("status", "done").is("suite_id", null).order("started_at", { ascending: false }).limit(60),
    getFlags(),
  ]);
  const prompts = PROMPT_KEYS.map((key) => {
    const versions = (v.data ?? []).filter((x) => x.key === key);
    const rollout = (r.data ?? []).find((x) => x.key === key) ?? { key, active_version: null, candidate_version: null, mode: "off", percent: 0 };
    // Latest all-suites pass rate for each version (null version = default in code).
    const rate = (ver: number | null) => {
      const run = (runs.data ?? []).find((x) => {
        const p = (x.prompts as Record<string, unknown>)?.[key];
        return ver == null ? p == null || p === "default" : String(p) === String(ver);
      });
      if (!run) return null;
      const cases = (run.total as number) / ((run.repeats as number) || 1);
      return { runId: run.id, rate: cases ? (run.passed as number) / cases : 0 };
    };
    return { key, ...PROMPT_META[key], default: DEFAULT_PROMPTS[key], versions: versions.map((x) => ({ ...x, eval: rate(x.version as number) })), defaultEval: rate(null), rollout };
  });
  return json({ prompts, gate: flags.promote_gate });
});
