import { handle, HttpError, json, options } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { STARTER_SUITES } from "@/lib/admin/seed";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const db = admin();
  const [s, c, r] = await Promise.all([
    db.from("eval_suites").select("*").order("created_at"),
    db.from("eval_cases").select("id,suite_id,name,kind,checks,updated_at").order("created_at"),
    db.from("eval_runs").select("id,suite_id,status,total,repeats,passed,flaky,started_at").order("started_at", { ascending: false }).limit(200),
  ]);
  const suites = (s.data ?? []).map((x) => {
    const cases = (c.data ?? []).filter((k) => k.suite_id === x.id);
    const last = (r.data ?? []).find((k) => k.suite_id === x.id && k.status === "done");
    return { ...x, cases, last: last ? { id: last.id, rate: (last.total as number) ? (last.passed as number) / ((last.total as number) / (last.repeats as number)) : 0, flaky: last.flaky, at: last.started_at } : null };
  });
  return json({ suites });
});

/** { action: "seed" } adds the starter suites once. { action: "create", name, type } adds an empty suite. */
export const POST = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const b = await req.json();
  const db = admin();
  if (b.action === "seed") {
    let added = 0;
    for (const s of STARTER_SUITES) {
      const { data: have } = await db.from("eval_suites").select("id").eq("slug", s.slug).maybeSingle();
      if (have) continue;
      const { data: row, error } = await db.from("eval_suites").insert({ slug: s.slug, name: s.name, type: s.type }).select("id").single();
      if (error) throw new Error(error.message);
      await db.from("eval_cases").insert(s.cases.map((c) => ({ suite_id: row.id, name: c.name, kind: c.kind, input: c.input, checks: c.checks, created_by: me.id })));
      added += s.cases.length;
    }
    await audit(me, "eval_seed", undefined, { added });
    return json({ added });
  }
  if (b.action === "create") {
    const name = String(b.name ?? "").trim();
    if (!name || !["extraction", "plan", "safety"].includes(b.type)) throw new HttpError(400, "Give the suite a name and a type.");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 5);
    const { data, error } = await db.from("eval_suites").insert({ slug, name, type: b.type }).select("id").single();
    if (error) throw new Error(error.message);
    return json({ id: data.id });
  }
  throw new HttpError(400, "Unknown action");
});
