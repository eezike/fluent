import { tool } from "ai";
import { z } from "zod";
import { admin } from "../supabase-admin";
import { buildTools } from "./tools";
import { createNotification } from "../notifications";
import { money, shortDate } from "../core/rules";
import type { Plan } from "../core/plan";

async function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tool failed" };
  }
}

const READ = ["search_gmail", "read_gmail_thread", "read_gmail_attachment", "read_rate_card", "read_sheet", "airtable_get_schema", "airtable_list_deals"] as const;

export function askTools(userId: string, mode: "answer" | "task") {
  const base = buildTools({ userId, conversationId: "" }) as Record<string, any>;
  const tools: Record<string, any> = {};
  for (const k of READ) tools[k] = base[k];

  tools.list_deals = tool({
    description: "List the user's deals as Fluent knows them (cached from their source of truth). Use overdueOnly for unpaid deals past their payment date.",
    inputSchema: z.object({ overdueOnly: z.boolean().optional(), brand: z.string().optional() }),
    execute: ({ overdueOnly, brand }) =>
      safe(async () => {
        let q = admin().from("deals").select("brand, fee, currency, status, payment_due, paid_at, post_start, post_end, usage_rights_end, exclusivity_until, contact_email").eq("user_id", userId).order("created_at", { ascending: false }).limit(60);
        if (overdueOnly) q = q.lt("payment_due", new Date().toISOString().slice(0, 10)).is("paid_at", null).not("status", "in", "(paid,declined)");
        if (brand) q = q.ilike("brand", `%${brand}%`);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return { deals: data ?? [] };
      }),
  });

  if (mode === "task") {
    tools.create_gmail_draft = base.create_gmail_draft;
    tools.propose_email = tool({
      description: "Prepare an email for the user to approve and send. This never sends: it appears in their Active list with an Approve & send button.",
      inputSchema: z.object({ to: z.string(), subject: z.string(), body: z.string(), threadId: z.string().optional() }),
      execute: (p) =>
        safe(async () => {
          const plan: Plan = {
            category: "money",
            type: "email_proposal",
            urgency: "normal",
            title: `Email ready: ${p.subject}`.slice(0, 120),
            body: `To ${p.to}. Approve to send.`,
            flags: [],
            terms: [],
            steps: [{ label: "Drafted the email in your voice", state: "done" }, { label: "Approve, and I’ll send it", state: "todo" }],
            sources: [],
            changes: [{ kind: "new", text: `Gmail: send to ${p.to}: ${p.subject}` }],
            changeNote: "1 change · nothing is sent until you approve",
            primaryLabel: "Approve & send",
            detailPrimaryLabel: "Approve & send",
            secondaryLabel: "Dismiss",
            actions: [{ id: `send-${Date.now().toString(36)}`, kind: "gmail.send", summary: `Gmail: send to ${p.to}`, params: p, status: "planned" }],
          };
          const n = await createNotification(userId, `proposal:${Date.now().toString(36)}`, plan, { threadId: p.threadId, agentMessage: "Here's the email. Approve to send, or tell me what to change." });
          return { status: "awaiting_user_approval", notificationId: n?.id };
        }),
    });
  }
  return tools;
}

export const TOOL_SOURCE: Record<string, { app: "gmail" | "sheets" | "airtable" | "fluent"; name: string; meta: string }> = {
  search_gmail: { app: "gmail", name: "Gmail search", meta: "Gmail" },
  read_gmail_thread: { app: "gmail", name: "Email thread", meta: "Gmail" },
  read_gmail_attachment: { app: "gmail", name: "Attached PDF", meta: "Gmail attachment" },
  read_rate_card: { app: "sheets", name: "Rate card", meta: "Google Sheets" },
  read_sheet: { app: "sheets", name: "Google Sheet", meta: "Google Sheets" },
  airtable_get_schema: { app: "airtable", name: "Deals table", meta: "Airtable" },
  airtable_list_deals: { app: "airtable", name: "Deals", meta: "Airtable" },
  list_deals: { app: "fluent", name: "Your deals", meta: "Fluent" },
};
export const dollars = (n: number | null) => (n ? money(n) : "");
export const when = (d: string | null) => (d ? shortDate(d) : "");
