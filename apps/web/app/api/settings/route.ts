import type { SetupStatus } from "@fluent/shared";
import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabase-admin";
import { getConnection } from "@/lib/connections";
import { getSettings, updateSettings } from "@/lib/settings";
import { chooseSot, importDeals, sotChoices } from "@/lib/sync/source";

export const runtime = "nodejs";
export const maxDuration = 60;
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const db = admin();
  const [s, c, g, asked, approved] = await Promise.all([
    getSettings(user.id),
    sotChoices(user.id),
    getConnection(user.id, "google"),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("type", ["answer", "task"]),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "done"),
  ]);
  const status: SetupStatus = {
    onboarded: !!s.onboarded_at,
    checklistDismissed: s.checklist_dismissed,
    googleConnected: !!g,
    sourceOfTruth: s.source_of_truth,
    available: { airtable: !!c.airtable, sheets: !!c.sheets },
    hasAsked: (asked.count ?? 0) > 0,
    hasApproved: (approved.count ?? 0) > 0,
  };
  // Kept for the connectors sheet.
  return json({ ...status, sourceOfTruth: s.source_of_truth });
});

/** Any of: { sourceOfTruth: "airtable" | "sheets" | "none" }, { onboarded: true }, { checklistDismissed: true }. */
export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req);
  const b = await req.json();
  let imported = 0;
  if ("sourceOfTruth" in b) {
    if (b.sourceOfTruth === "airtable" || b.sourceOfTruth === "sheets") {
      await chooseSot(user.id, b.sourceOfTruth);
      imported = await importDeals(user.id, { force: true });
    } else if (b.sourceOfTruth !== "none") throw new HttpError(400, "Invalid source of truth");
  }
  if (b.onboarded === true) await updateSettings(user.id, { onboarded_at: new Date().toISOString() });
  if (b.checklistDismissed === true) await updateSettings(user.id, { checklist_dismissed: true });
  return json({ ok: true, imported });
});
