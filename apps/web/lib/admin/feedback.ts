import { admin } from "../supabase-admin";

export type FeedbackEvent = "approved" | "dismissed" | "snoozed" | "refined";
export type DraftDiff = { actionKind: string; field: string; before: string; after: string };

/** What the user changed in a draft before approving. Only email subject and body are compared. */
export function draftDiffs(actions: { id: string; kind: string; params: Record<string, unknown> }[], edits?: Record<string, Record<string, unknown>>): DraftDiff[] {
  const out: DraftDiff[] = [];
  for (const [id, patch] of Object.entries(edits ?? {})) {
    const a = actions.find((x) => x.id === id);
    if (!a) continue;
    for (const field of ["subject", "body"]) {
      if (field in patch && String(patch[field] ?? "") !== String(a.params[field] ?? "")) out.push({ actionKind: a.kind, field, before: String(a.params[field] ?? "").slice(0, 4000), after: String(patch[field] ?? "").slice(0, 4000) });
    }
  }
  return out;
}

/** Records how a person responded to a card, so prompts can be judged by what people do with them. Never throws. */
export async function recordFeedback(userId: string, row: any, event: FeedbackEvent, extra: { edits?: Record<string, Record<string, unknown>>; message?: string } = {}) {
  try {
    const diffs = event === "approved" ? draftDiffs(row.proposed?.actions ?? [], extra.edits) : [];
    await admin().from("feedback_events").insert({
      user_id: userId,
      notification_id: row.id,
      notif_type: row.type,
      event,
      edited: diffs.length > 0,
      detail: { title: row.title, ...(diffs.length ? { diffs } : {}), ...(extra.message ? { message: extra.message.slice(0, 500) } : {}) },
      run_id: row.proposed?.runId ?? null,
    });
  } catch (e) {
    console.error("feedback failed", e instanceof Error ? e.message : e);
  }
}
