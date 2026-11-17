import { after } from "next/server";
import { handle, json, options } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { executeEvalRun, startEvalRun } from "@/lib/admin/evals";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 300;
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const { data } = await admin().from("eval_runs").select("*").order("started_at", { ascending: false }).limit(40);
  return json({ runs: data ?? [] });
});

/** Starts a run and returns right away; the page polls the run for progress. */
export const POST = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const b = await req.json();
  const id = await startEvalRun({ suiteId: b.suiteId ?? null, prompts: b.prompts ?? {}, model: b.model ?? null, repeats: b.repeats ?? 1, by: me.id });
  await audit(me, "eval_run", id, { suiteId: b.suiteId ?? "all", prompts: b.prompts, model: b.model, repeats: b.repeats });
  after(() => executeEvalRun(id));
  return json({ id });
});
