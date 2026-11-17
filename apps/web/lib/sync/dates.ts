import { admin } from "../supabase-admin";
import { getSettings } from "../settings";
import { createNotification, notificationExists, setStatus } from "../notifications";
import { addDays, daysBetween } from "../core/rules";
import { planOverdue, planUsageEnding, type DueDeal } from "../core/plan";
import { draftFollowUp, draftRenewal } from "./drafts";
import { today } from "./offers";

const toDue = (d: any): DueDeal => ({ id: d.id, brand: d.brand, fee: d.fee, currency: d.currency, payment_due: d.payment_due, usage_rights_end: d.usage_rights_end, contact_email: d.contact_email, thread_id: d.thread_id });

/** Date-driven notifications, read from the deals table (which mirrors the user's source of truth). */
export async function runDateChecks(userId: string): Promise<number> {
  const s = await getSettings(userId);
  const sot = s.source_of_truth;
  const db = admin();
  const t = today();
  let created = 0;

  const { data: overdue } = await db.from("deals").select("*").eq("user_id", userId).lt("payment_due", t).is("paid_at", null).not("status", "in", "(paid,declined)");
  for (const d of overdue ?? []) {
    const late = daysBetween(d.payment_due, t);
    const key = `overdue:${d.id}:${Math.min(3, Math.floor(late / 14))}`; // nudge again every two weeks, at most three times
    if (await notificationExists(userId, key)) continue;
    const body = await draftFollowUp(d.brand, null, d.fee, d.currency, d.payment_due, late);
    if (await createNotification(userId, key, planOverdue(toDue(d), t, sot, body), { threadId: d.thread_id, agentMessage: `${d.brand} is ${late} days past due. ${d.contact_email ? "Here's a follow-up. Approve to send, or tell me what to change." : "Add a contact email and I can draft the follow-up."}` })) created++;
  }

  const { data: ending } = await db.from("deals").select("*").eq("user_id", userId).gte("usage_rights_end", t).lte("usage_rights_end", addDays(t, 14)).not("status", "eq", "declined");
  for (const d of ending ?? []) {
    const key = `usage:${d.id}`;
    if (await notificationExists(userId, key)) continue;
    const body = await draftRenewal(d.brand, null, d.usage_rights_end);
    if (await createNotification(userId, key, planUsageEnding(toDue(d), t, sot, body), { threadId: d.thread_id })) created++;
  }

  await closeResolved(userId);
  return created;
}

/** If the source of truth now says a deal is paid, the overdue notification is no longer needed. */
async function closeResolved(userId: string) {
  const db = admin();
  const { data: open } = await db.from("notifications").select("id, dedupe_key").eq("user_id", userId).eq("type", "payment_overdue").eq("status", "open");
  for (const n of open ?? []) {
    const dealId = String(n.dedupe_key).split(":")[1];
    const { data: d } = await db.from("deals").select("paid_at, status").eq("id", dealId).maybeSingle();
    if (d && (d.paid_at || d.status === "paid")) await setStatus(userId, n.id, "done", { proposed: { resultTag: "Paid" }, steps: [{ label: "Payment received", state: "done" }] });
  }
}
