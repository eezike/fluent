import { generateObject } from "ai";
import { z } from "zod";
import type { PlannedAction } from "@fluent/shared";
import { getModel } from "./agent/models";
import { getRow, rowToDTO } from "./notifications";
import { admin } from "./supabase-admin";
import { HttpError } from "./http";
import { resolvePrompt } from "./admin/prompts";
import { logRun, modelId } from "./admin/runlog";
import { assertAgentActive } from "./admin/flags";

const Out = z.object({
  reply: z.string().describe("One or two plain sentences telling the user what you changed, or why you couldn't."),
  updates: z
    .array(z.object({ actionId: z.string(), subject: z.string().nullable(), body: z.string().nullable() }))
    .describe("Edited email drafts. Only include drafts you changed."),
  newChange: z.string().nullable().describe("If the user changed terms such as the fee or dates, the new text for the green line in Changes. Otherwise null."),
});

export async function refine(userId: string, id: string, message: string) {
  const row = await getRow(userId, id);
  if (row.status !== "open") throw new HttpError(409, "This task is no longer open for changes.");
  const actions: PlannedAction[] = row.proposed?.actions ?? [];
  const drafts = actions.filter((a) => a.kind === "gmail.draft" || a.kind === "gmail.send");
  await assertAgentActive(userId);
  const p = await resolvePrompt("refine", { userId });
  const startedAt = Date.now();
  const prompt = `Task: ${row.title}\nChanges shown: ${JSON.stringify(row.proposed?.changes ?? [])}\nDrafts: ${JSON.stringify(drafts.map((d) => ({ actionId: d.id, to: d.params.to, subject: d.params.subject, body: d.params.body })))}\n\nConversation so far: ${JSON.stringify(row.thread ?? [])}\n\nUser asks: ${message.slice(0, 1500)}`;
  let object: z.infer<typeof Out>;
  try {
    const r = await generateObject({ model: getModel(), schema: Out, system: p.text, prompt });
    object = r.object;
    await logRun({ userId, kind: "refine", promptKey: "refine", promptVersion: p.version, model: modelId(), input: { prompt }, output: object, usage: r.usage as never, startedAt });
  } catch (e) {
    await logRun({ userId, kind: "refine", promptKey: "refine", promptVersion: p.version, model: modelId(), input: { prompt }, error: e instanceof Error ? e.message : "failed", startedAt });
    throw e;
  }

  const byId = new Map(drafts.map((d) => [d.id, d]));
  const next = actions.map((a) => {
    const u = object.updates.find((x) => x.actionId === a.id);
    if (!u || !byId.has(a.id)) return a;
    return { ...a, params: { ...a.params, ...(u.subject ? { subject: u.subject.slice(0, 300) } : {}), ...(u.body ? { body: u.body.slice(0, 8000) } : {}) } };
  });
  const changes = [...(row.proposed?.changes ?? [])];
  if (object.newChange) {
    const i = changes.map((c: any) => c.kind).lastIndexOf("new");
    if (i >= 0) changes[i] = { kind: "new", text: object.newChange.slice(0, 300) };
  }
  const thread = [...(row.thread ?? []), { role: "user", text: message.slice(0, 1500) }, { role: "agent", text: object.reply.slice(0, 600) }];
  const { data, error } = await admin()
    .from("notifications")
    .update({ thread, proposed: { ...row.proposed, actions: next, changes }, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "open")
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToDTO(data);
}
