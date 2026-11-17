import { generateText, stepCountIs } from "ai";
import { toolLabel, type NotificationDTO, type Source } from "@fluent/shared";
import { getModel } from "./agent/models";
import { askTools, TOOL_SOURCE } from "./agent/ask-tools";
import { admin } from "./supabase-admin";
import { rowToDTO } from "./notifications";
import { resolvePrompt } from "./admin/prompts";
import { fillPrompt } from "./admin/defaults";
import { logRun, modelId } from "./admin/runlog";
import { assertAgentActive } from "./admin/flags";

const sourcesFrom = (names: string[]): Source[] => {
  const seen = new Map<string, Source>();
  for (const n of names) {
    const s = TOOL_SOURCE[n];
    if (s && !seen.has(s.name)) seen.set(s.name, s);
  }
  return [...seen.values()];
};

/** "Answer": read-only, returns a finished notification in the Done tab. */
export async function answerQuestion(userId: string, message: string): Promise<NotificationDTO> {
  const today = new Date().toISOString().slice(0, 10);
  await assertAgentActive(userId);
  let text = "";
  let names: string[] = [];
  const p = await resolvePrompt("ask_answer", { userId });
  const startedAt = Date.now();
  try {
    const r = await generateText({ model: getModel(), system: fillPrompt(p.text, { today }), prompt: message, tools: askTools(userId, "answer"), stopWhen: stepCountIs(8) });
    text = r.text.trim() || "I couldn't find anything for that.";
    names = r.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
    await logRun({ userId, kind: "ask", promptKey: "ask_answer", promptVersion: p.version, model: modelId(), input: { message }, output: { text, tools: names }, usage: r.usage as never, startedAt });
  } catch (e) {
    text = `I couldn't answer that: ${e instanceof Error ? e.message : "something went wrong"}`;
    await logRun({ userId, kind: "ask", promptKey: "ask_answer", promptVersion: p.version, model: modelId(), input: { message }, error: text, startedAt });
  }
  const { data, error } = await admin()
    .from("notifications")
    .insert({ user_id: userId, dedupe_key: `answer:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 6)}`, category: "info", type: "answer", title: message.slice(0, 120), body: text.slice(0, 200), status: "done", sources: sourcesFrom(names), proposed: { answer: text, resultTag: undefined } })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToDTO(data);
}

/** "Do it": creates a running task immediately; the caller schedules runTask() with after(). */
export async function startTask(userId: string, message: string): Promise<NotificationDTO> {
  await assertAgentActive(userId);
  const title = message.trim().charAt(0).toUpperCase() + message.trim().slice(1);
  const { data, error } = await admin()
    .from("notifications")
    .insert({
      user_id: userId,
      dedupe_key: `task:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 6)}`,
      category: "info",
      type: "task",
      title: title.slice(0, 120),
      body: "Started just now. I'll track every step and source here.",
      status: "running",
      steps: [{ label: "Picked up your request", state: "done" }, { label: "Planning the steps", state: "done" }, { label: "Working…", state: "todo" }],
      thread: [{ role: "user", text: message.slice(0, 1500) }, { role: "agent", text: "Got it. I'll work on this and log every step and source here." }],
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToDTO(data);
}

export async function runTask(userId: string, id: string, message: string): Promise<void> {
  const db = admin();
  const today = new Date().toISOString().slice(0, 10);
  const names: string[] = [];
  const stepsNow = () => [
    { label: "Picked up your request", state: "done" },
    { label: "Planning the steps", state: "done" },
    ...names.map((n) => ({ label: toolLabel(n), state: "done" })),
  ];
  const p = await resolvePrompt("ask_task", { userId });
  const startedAt = Date.now();
  try {
    const r = await generateText({
      model: getModel(),
      system: fillPrompt(p.text, { today }),
      prompt: message,
      tools: askTools(userId, "task"),
      stopWhen: stepCountIs(12),
      onStepFinish: async (s) => {
        for (const c of s.toolCalls) names.push(c.toolName);
        await db.from("notifications").update({ steps: [...stepsNow(), { label: "Working…", state: "todo" }], sources: sourcesFrom(names), updated_at: new Date().toISOString() }).eq("id", id);
      },
    });
    await logRun({ userId, kind: "ask", promptKey: "ask_task", promptVersion: p.version, model: modelId(), input: { message }, output: { text: r.text, tools: names }, usage: r.usage as never, startedAt });
    const { data: row } = await db.from("notifications").select("thread, proposed").eq("id", id).single();
    await db
      .from("notifications")
      .update({ status: "done", steps: [...stepsNow(), { label: "Wrote up the result", state: "done" }], sources: sourcesFrom(names), thread: [...(row?.thread ?? []), { role: "agent", text: r.text.trim() || "Done." }], proposed: { ...(row?.proposed ?? {}), resultTag: "Done" }, updated_at: new Date().toISOString() })
      .eq("id", id);
  } catch (e) {
    await logRun({ userId, kind: "ask", promptKey: "ask_task", promptVersion: p.version, model: modelId(), input: { message }, error: e instanceof Error ? e.message : "failed", startedAt });
    const { data: row } = await db.from("notifications").select("thread").eq("id", id).single();
    await db
      .from("notifications")
      .update({ status: "done", steps: [...stepsNow(), { label: "Couldn’t finish", state: "todo" }], thread: [...(row?.thread ?? []), { role: "agent", text: `I couldn't finish this: ${e instanceof Error ? e.message : "something went wrong"}` }], proposed: { resultTag: "Couldn’t finish" }, updated_at: new Date().toISOString() })
      .eq("id", id);
  }
}
