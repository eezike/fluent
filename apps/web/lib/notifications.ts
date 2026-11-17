import type { NotificationCounts, NotificationDTO, NotificationList, PlannedAction } from "@fluent/shared";
import { admin } from "./supabase-admin";
import { HttpError } from "./http";
import type { Plan } from "./core/plan";

export function rowToDTO(r: any): NotificationDTO {
  const p = r.proposed ?? {};
  const actions: PlannedAction[] = (p.actions ?? []).filter((a: PlannedAction) => !a.hidden);
  const steps = r.steps ?? [];
  const doneSteps = steps.filter((s: any) => s.state === "done").length;
  return {
    id: r.id,
    category: r.category,
    type: r.type,
    title: r.title,
    body: r.body,
    urgency: r.urgency,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    flags: r.flags ?? [],
    terms: r.terms ?? [],
    steps,
    sources: r.sources ?? [],
    changes: p.changes ?? [],
    changeNote: p.changeNote,
    primaryLabel: p.primaryLabel,
    detailPrimaryLabel: p.detailPrimaryLabel,
    secondaryLabel: p.secondaryLabel,
    actions,
    options:
      r.type === "ask_source_of_truth"
        ? [
            { value: "airtable", label: "Use Airtable" },
            { value: "sheets", label: "Use Sheets" },
          ]
        : undefined,
    thread: r.thread ?? [],
    error: r.error ?? undefined,
    progress: r.status === "running" ? Math.max(10, Math.round((doneSteps / Math.max(steps.length, 1)) * 100)) : undefined,
    resultTag: p.resultTag,
    answer: p.answer,
  };
}

export async function createNotification(
  userId: string,
  dedupeKey: string,
  plan: Plan,
  extra: { threadId?: string | null; agentMessage?: string; runId?: string | null } = {},
): Promise<NotificationDTO | null> {
  const { data, error } = await admin()
    .from("notifications")
    .insert({
      user_id: userId,
      dedupe_key: dedupeKey,
      category: plan.category,
      type: plan.type,
      title: plan.title,
      body: plan.body,
      urgency: plan.urgency,
      flags: plan.flags,
      terms: plan.terms,
      steps: plan.steps,
      sources: plan.sources,
      proposed: {
        primaryLabel: plan.primaryLabel,
        detailPrimaryLabel: plan.detailPrimaryLabel,
        secondaryLabel: plan.secondaryLabel,
        actions: plan.actions,
        changes: plan.changes,
        changeNote: plan.changeNote,
        ...(extra.runId ? { runId: extra.runId } : {}),
      },
      thread: extra.agentMessage ? [{ role: "agent", text: extra.agentMessage }] : [],
      thread_id: extra.threadId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return null; // already notified for this key
    throw new Error(error.message);
  }
  return rowToDTO(data);
}

export async function notificationExists(userId: string, dedupeKey: string): Promise<boolean> {
  const { data } = await admin().from("notifications").select("id").eq("user_id", userId).eq("dedupe_key", dedupeKey).maybeSingle();
  return !!data;
}

export async function getRow(userId: string, id: string) {
  const { data } = await admin().from("notifications").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "Notification not found");
  return data;
}

const rank = (r: any) => (r.status === "open" ? (r.urgency === "urgent" ? 0 : 1) : 2);

export async function listNotifications(userId: string, tab: "active" | "done"): Promise<NotificationList> {
  const db = admin();
  const now = new Date().toISOString();
  const { data: activeRows } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["open", "running"])
    .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
    .order("created_at", { ascending: false })
    .limit(100);
  const active = (activeRows ?? []).sort((a, b) => rank(a) - rank(b));
  const { count: doneCount } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["done", "dismissed"]);
  const counts: NotificationCounts = {
    active: active.length,
    done: doneCount ?? 0,
    toReview: active.filter((r) => r.status === "open").length,
    inProgress: active.filter((r) => r.status === "running").length,
    urgent: active.filter((r) => r.status === "open" && r.urgency === "urgent").length,
  };
  if (tab === "active") return { items: active.map(rowToDTO), counts };
  const { data: doneRows } = await db.from("notifications").select("*").eq("user_id", userId).in("status", ["done", "dismissed"]).order("updated_at", { ascending: false }).limit(50);
  return { items: (doneRows ?? []).map(rowToDTO), counts };
}

export async function setStatus(userId: string, id: string, status: "open" | "running" | "done" | "dismissed", patch: Record<string, unknown> = {}) {
  const { data, error } = await admin().from("notifications").update({ status, updated_at: new Date().toISOString(), ...patch }).eq("id", id).eq("user_id", userId).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
