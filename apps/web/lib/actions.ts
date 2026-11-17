import type { GmailSendPayload, PendingAction } from "@fluent/shared";
import { admin } from "./supabase-admin";
import { HttpError } from "./http";
import { sendMessage } from "./connectors/gmail";

export function rowToAction(r: any): PendingAction {
  return {
    id: r.id,
    kind: r.kind,
    summary: r.summary,
    payload: r.payload,
    status: r.status,
    error: r.result?.error,
  };
}

export async function getAction(userId: string, id: string) {
  const { data } = await admin().from("pending_actions").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "Action not found");
  return data;
}

export async function decide(
  userId: string,
  id: string,
  decision: "approve" | "reject",
  edited?: GmailSendPayload,
): Promise<PendingAction> {
  const row = await getAction(userId, id);
  if (row.status !== "pending") return rowToAction(row);

  if (decision === "reject") {
    const { data } = await admin().from("pending_actions").update({ status: "rejected" }).eq("id", id).select("*").single();
    return rowToAction(data);
  }

  const payload: GmailSendPayload = {
    to: edited?.to ?? row.payload.to,
    subject: edited?.subject ?? row.payload.subject,
    body: edited?.body ?? row.payload.body,
    threadId: row.payload.threadId,
  };

  // Claim the row first so a double click can't send twice.
  const { data: claimed } = await admin()
    .from("pending_actions")
    .update({ status: "approved", payload })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (!claimed) return rowToAction(await getAction(userId, id));

  try {
    const result = await sendMessage(userId, payload);
    const { data } = await admin().from("pending_actions").update({ status: "executed", result }).eq("id", id).select("*").single();
    return rowToAction(data);
  } catch (e) {
    const { data } = await admin()
      .from("pending_actions")
      .update({ status: "failed", result: { error: e instanceof Error ? e.message : "Send failed" } })
      .eq("id", id)
      .select("*")
      .single();
    return rowToAction(data);
  }
}
