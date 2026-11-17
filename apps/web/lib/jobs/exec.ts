import type { PlannedAction } from "@fluent/shared";
import { admin } from "../supabase-admin";
import { getConnection } from "../connections";
import { createDraft, sendMessage } from "../connectors/gmail";
import { createAllDayEvent } from "../connectors/calendar";
import { appendRow } from "../connectors/sheets";
import { createDeal, getSchema } from "../connectors/airtable";
import { dealToAirtableFields, dealToSheetRow, type DealFields } from "../core/mapping";
import type { Exec } from "../core/runner";
import { DEALS_TAB, sotChoices } from "../sync/source";
import { getFlags } from "../admin/flags";

type Ctx = { userId: string; notificationId: string; threadId: string | null };

/** The only code that writes to the user's tools. It runs solely from an approved job. */
export function executor({ userId, notificationId, threadId }: Ctx): Exec {
  const db = admin();
  let dealId: string | null = null;

  return async (a: PlannedAction) => {
    const flags = await getFlags(true);
    // Admin controls. Sending is the one irreversible step, so it has its own switch.
    if (a.kind === "gmail.send" && flags.pause_sending) throw new Error("Sending is paused right now. Your draft is saved; try again later.");
    if (flags.dry_run_all) return { label: `Dry run: ${a.summary} (nothing was changed)` };
    switch (a.kind) {
      case "deal.upsert": {
        const key = `fluent:${threadId ?? notificationId}`;
        const { data, error } = await db
          .from("deals")
          .upsert({ user_id: userId, source_key: key, ...a.params.deal, thread_id: threadId, contact_email: a.params.contactEmail ?? null, updated_at: new Date().toISOString() }, { onConflict: "user_id,source_key" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        dealId = data.id as string;
        await db.from("notifications").update({ deal_id: dealId }).eq("id", notificationId);
        return { label: "Deal recorded" };
      }

      case "calendar.event": {
        const events = (a.params.events ?? []) as { title: string; date: string }[];
        let first: string | undefined;
        for (const e of events) {
          const r = await createAllDayEvent(userId, { title: e.title, date: e.date });
          first ??= r.url;
        }
        return { label: `${events.length} calendar events`, url: first };
      }

      case "source.append": {
        const deal = a.params.deal as Partial<DealFields>;
        let sourceKey: string | null = null;
        let label: string;
        if (a.params.target === "airtable") {
          const schema = await getSchema(userId);
          const fields = dealToAirtableFields(schema.fields.map((f) => f.name), deal);
          if (!Object.keys(fields).length) throw new Error("None of your Airtable fields matched. Add Brand and Fee fields, or connect a different table.");
          const r = await createDeal(userId, fields);
          sourceKey = `airtable:${r.id}`;
          label = "Airtable row";
        } else {
          const c = await sotChoices(userId);
          if (!c.sheets) throw new Error("No Google Sheet is set for deals. Add its Sheet ID in Connectors.");
          const r = await appendRow(userId, c.sheets.sheetId, DEALS_TAB, dealToSheetRow(deal));
          if (r.row) sourceKey = `sheet:${c.sheets.sheetId}:${r.row}`;
          label = "Sheet row";
        }
        // Point the cached deal at its new home so the next import updates it instead of duplicating it.
        if (dealId && sourceKey) await db.from("deals").update({ source_key: sourceKey }).eq("id", dealId).eq("user_id", userId);
        return { label };
      }

      case "gmail.draft": {
        const p = a.params as { to: string; subject: string; body: string; threadId?: string };
        if (!p.to) throw new Error("There's no recipient for this draft. Add one and try again.");
        await createDraft(userId, p);
        return { label: "Gmail draft", url: "https://mail.google.com/mail/u/0/#drafts" };
      }

      case "gmail.send": {
        const p = a.params as { to: string; subject: string; body: string; threadId?: string };
        if (!p.to) throw new Error("There's no recipient for this email.");
        await sendMessage(userId, p);
        return { label: "Sent", url: "https://mail.google.com/mail/u/0/#sent" };
      }
    }
  };
}

export async function requireConnections(userId: string, actions: PlannedAction[]) {
  const needsGoogle = actions.some((a) => ["calendar.event", "gmail.draft", "gmail.send"].includes(a.kind) || (a.kind === "source.append" && a.params.target === "sheets"));
  if (needsGoogle && !(await getConnection(userId, "google"))) throw new Error("Google isn't connected. Open Connectors and connect Google.");
}
