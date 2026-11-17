import type { PlannedAction } from "@fluent/shared";
import { admin } from "../supabase-admin";
import { HttpError } from "../http";
import { getRow, setStatus } from "../notifications";
import { applyEdits, resultTag, runActions, stepsFor } from "../core/runner";
import { executor, requireConnections } from "./exec";

/** Claims the notification (open -> running) so a double click can't run it twice, then records a job. */
export async function startJob(userId: string, id: string, edits?: Record<string, Record<string, unknown>>) {
  const row = await getRow(userId, id);
  if (row.status !== "open") throw new HttpError(409, row.status === "running" ? "Already running." : "This has already been handled.");
  const actions: PlannedAction[] = applyEdits(row.proposed?.actions ?? [], edits).map((a) => ({ ...a, status: a.status === "done" ? "done" : "planned" }));
  await requireConnections(userId, actions);
  const { data: claimed } = await admin()
    .from("notifications")
    .update({ status: "running", error: null, updated_at: new Date().toISOString(), proposed: { ...row.proposed, actions }, steps: stepsFor(actions) })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "open")
    .select("*")
    .maybeSingle();
  if (!claimed) throw new HttpError(409, "Already running.");
  const { data: job, error } = await admin().from("jobs").insert({ user_id: userId, notification_id: id, steps: stepsFor(actions) }).select("id").single();
  if (error) throw new Error(error.message);
  return { jobId: job.id as string, notification: claimed };
}

/** Executes the approved actions. Safe to call from `after()`: it never throws. */
export async function runJob(userId: string, jobId: string): Promise<void> {
  const db = admin();
  const { data: job } = await db.from("jobs").select("*").eq("id", jobId).eq("user_id", userId).single();
  if (!job) return;
  const row = await getRow(userId, job.notification_id);
  const exec = executor({ userId, notificationId: row.id, threadId: row.thread_id });
  try {
    const r = await runActions(row.proposed.actions, exec, async (actions, steps, error) => {
      await db.from("notifications").update({ proposed: { ...row.proposed, actions }, steps, error: error ?? null, updated_at: new Date().toISOString() }).eq("id", row.id);
      await db.from("jobs").update({ steps }).eq("id", jobId);
    });
    const finished = new Date().toISOString();
    if (r.ok) {
      await setStatus(userId, row.id, "done", { proposed: { ...row.proposed, actions: r.actions, resultTag: resultTag(r.actions) || "Done" }, steps: r.steps, error: null });
      await db.from("jobs").update({ status: "done", finished_at: finished }).eq("id", jobId);
    } else {
      // Back to "open" so the user can retry. Finished actions are skipped on retry.
      await setStatus(userId, row.id, "open", { proposed: { ...row.proposed, actions: r.actions }, steps: r.steps, error: r.error });
      await db.from("jobs").update({ status: "failed", error: r.error, finished_at: finished }).eq("id", jobId);
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : "Job failed";
    await setStatus(userId, row.id, "open", { error });
    await db.from("jobs").update({ status: "failed", error, finished_at: new Date().toISOString() }).eq("id", jobId);
  }
}

export async function completeWithoutActions(userId: string, id: string) {
  await setStatus(userId, id, "done", { steps: [{ label: "Picked up your approval", state: "done" }], proposed: { resultTag: "Done" } });
}
