// Notification-first wire types shared by the PWA, the API and the Chrome extension.

export type NotificationCategory = "opportunity" | "attention" | "money" | "info";
export type NotificationStatus = "open" | "running" | "done" | "dismissed";
export type StepState = "done" | "active" | "todo";

export type Step = { label: string; state: StepState };
export type Flag = { title: string; detail: string };
export type Term = { label: string; value: string; quote?: string };
export type Source = { app: "gmail" | "sheets" | "airtable" | "calendar" | "fluent"; name: string; meta: string };
export type Change = { kind: "old" | "new"; text: string };

export type ActionKind =
  | "deal.upsert"
  | "calendar.event"
  | "source.append"
  | "gmail.draft"
  | "gmail.send";

export type PlannedAction = {
  id: string;
  kind: ActionKind;
  /** One line shown in the "What I'll do" diff. */
  summary: string;
  params: Record<string, any>;
  status: "planned" | "running" | "done" | "failed";
  result?: { label?: string; url?: string; error?: string };
  /** Internal bookkeeping (for example saving the deal record). Not shown in Changes. */
  hidden?: boolean;
};

export type NotificationOption = { value: string; label: string };

export type NotificationDTO = {
  id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  urgency: "normal" | "urgent";
  status: NotificationStatus;
  createdAt: string;
  updatedAt: string;
  flags: Flag[];
  terms: Term[];
  steps: Step[];
  sources: Source[];
  changes: Change[];
  changeNote?: string;
  /** Button label on the list card, and on the detail view (which can be more specific). */
  primaryLabel?: string;
  detailPrimaryLabel?: string;
  secondaryLabel?: string;
  actions: PlannedAction[];
  /** Shown for a "question" notification, such as choosing the source of truth. */
  options?: NotificationOption[];
  thread: { role: "user" | "agent"; text: string }[];
  error?: string;
  progress?: number;
  /** Done tab: what happened, such as "Calendar · Airtable row · Gmail draft". */
  resultTag?: string;
  /** For a quick answer (type "answer"). */
  answer?: string;
};

export type NotificationCounts = { active: number; done: number; toReview: number; inProgress: number; urgent: number };

export type NotificationList = { items: NotificationDTO[]; counts: NotificationCounts };

export type ActRequest =
  | { action: "approve"; edits?: Record<string, Record<string, unknown>> }
  | { action: "dismiss" }
  | { action: "snooze" }
  | { action: "answer"; choice: string }
  | { action: "convert" };

export type RefineRequest = { message: string };

export type PageSuggestion = { kind: "brand_offer" | "contract"; brand: string; message: string } | null;
export type SourceOfTruth = "airtable" | "sheets";
export type SyncResult = { created: number; errors: string[]; skipped?: boolean };
