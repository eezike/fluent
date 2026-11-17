// Wire format shared by the web app, the API and the Chrome extension.

export type PageContext = {
  url: string;
  title: string;
  text: string;
  selection?: string;
};

export type ChatRequest = {
  conversationId?: string;
  message: string;
  context?: PageContext;
};

export type PendingActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export type GmailSendPayload = {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
};

export type PendingAction = {
  id: string;
  kind: "gmail_send";
  summary: string;
  payload: GmailSendPayload;
  status: PendingActionStatus;
  error?: string;
};

/** Events streamed (as newline-delimited JSON) from POST /api/chat. */
export type ChatEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; label: string }
  | { type: "tool_end"; id: string; ok: boolean }
  | { type: "pending"; action: PendingAction }
  | { type: "done" }
  | { type: "error"; message: string };

/** What the UI renders for a stored conversation. */
export type UiItem =
  | { kind: "user"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; name: string; label: string; ok: boolean | null }
  | { kind: "pending"; actionId: string };

export type ConversationSummary = { id: string; title: string; updated_at: string };

export type ConnectorStatus = {
  google: { connected: boolean; email?: string; rateCardSheetId?: string; rateCardRange?: string; dealsSheetId?: string };
  airtable: { connected: boolean; baseId?: string; table?: string };
};

export type Idea = { title: string; detail: string; action: string; prompt: string };

export const TOOL_LABELS: Record<string, string> = {
  search_gmail: "Searching Gmail",
  read_gmail_thread: "Reading the email thread",
  create_gmail_draft: "Saving a Gmail draft",
  send_gmail_reply: "Preparing to send",
  read_rate_card: "Checking your rate card",
  read_sheet: "Reading Google Sheets",
  airtable_get_schema: "Looking at your Airtable",
  airtable_list_deals: "Reading Airtable",
  airtable_create_deal: "Adding to Airtable",
  airtable_update_deal: "Updating Airtable",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}
