import { handle, HttpError, json, options } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { redact } from "@/lib/admin/redact";
import type { Check } from "@/lib/admin/checks";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const OPTIONS = options;

const PREFILL: { field: string; type: Check["type"] }[] = [
  { field: "kind", type: "exact" }, { field: "brand", type: "exact_ci" }, { field: "fee", type: "number" }, { field: "usageMonths", type: "number" },
  { field: "paymentNetDays", type: "number" }, { field: "exclusivityUntil", type: "date" }, { field: "contentDue", type: "date" }, { field: "postStart", type: "date" }, { field: "postEnd", type: "date" },
];

/** Turns a real classify run into an eval case. Personal details are redacted first; the checks are prefilled from what the agent said, for the admin to correct. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireAdmin(req);
  const { id } = await params;
  const { suiteId, name } = await req.json();
  if (!suiteId) throw new HttpError(400, "Choose a suite.");
  const { data: run } = await admin().from("agent_runs").select("*").eq("id", id).maybeSingle();
  if (!run) throw new HttpError(404, "Run not found");
  const email = (run.input as any)?.email;
  if (run.kind !== "classify" || !email) throw new HttpError(400, "Only email-reading runs can become eval cases.");
  const out = (run.output ?? {}) as Record<string, unknown>;
  const names = [out.contactName, out.brand].filter((n): n is string => typeof n === "string");
  const input = {
    from: redact(String(email.from), names.filter((n) => n !== out.brand)),
    subject: redact(String(email.subject), []),
    text: redact(String(email.text), names.filter((n) => n !== out.brand)),
    attachments: email.attachments ? redact(String(email.attachments), []) : undefined,
    today: email.today,
  };
  const checks: Check[] = PREFILL.filter((p) => p.field in out).map((p) => ({ ...p, expected: out[p.field] ?? null }));
  const { data, error } = await admin()
    .from("eval_cases")
    .insert({ suite_id: suiteId, name: (name as string) || `From run ${id.slice(0, 8)}`, kind: "classify", input, checks, source_run_id: id, created_by: me.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await audit(me, "eval_case_from_run", id, { caseId: data.id });
  return json({ id: data.id });
});
