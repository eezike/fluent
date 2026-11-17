import type { NotificationDTO } from "@fluent/shared";
import type { IconName } from "./icons";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).map((c) => `fl-${c}`).join(" ");

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

const EYEBROW: Record<string, string> = { opportunity: "New opportunity", attention: "Attention required", money: "Money", info: "Update" };
export function eyebrow(n: NotificationDTO): string | null {
  if (n.status === "running" || n.status === "done" || n.status === "dismissed") return null;
  if (n.type === "ask_source_of_truth") return "Question";
  return EYEBROW[n.category] ?? null;
}

export function urgentWhen(n: NotificationDTO): string {
  if (n.type === "offer_flagged") return n.flags.some((f) => /exclusiv/i.test(f.title)) ? "Conflict" : "Rate";
  if (n.type === "payment_overdue") return "Overdue";
  if (n.type === "usage_ending") return "Soon";
  return "Now";
}

export function look(n: NotificationDTO): { icon: IconName; accent: string } {
  if (n.status === "running") return { icon: "loader", accent: "#5AB570" };
  if (n.status === "done" || n.status === "dismissed") return n.type === "answer" ? { icon: "msg", accent: "#A8A8A8" } : { icon: "check", accent: "#A8A8A8" };
  switch (n.type) {
    case "offer_flagged":
    case "usage_ending":
      return { icon: "alert", accent: "#5683D2" };
    case "payment_overdue":
    case "email_proposal":
      return { icon: "money", accent: "#684162" };
    case "ask_source_of_truth":
      return { icon: "zap", accent: "#B2C7EB" };
    default:
      return { icon: "file", accent: "#684162" };
  }
}

export function doneNote(n: NotificationDTO): string {
  const t = ago(n.updatedAt);
  const when = t === "now" ? "just now" : t;
  if (n.type === "answer") return `Answered · ${when}`;
  if (n.status === "dismissed") return `You dismissed · ${when}`;
  if (n.type === "task") return `Done · ${when}`;
  return `Done · ${when}`;
}

export function pill(n: NotificationDTO): { text: string; cls: string } {
  if (n.type === "answer") return { text: "Quick answer", cls: "pz" };
  if (n.status === "running") return { text: "In progress", cls: "pg" };
  if (n.status === "done" || n.status === "dismissed") return { text: n.status === "dismissed" ? "Dismissed" : "Done", cls: "pz" };
  if (n.type === "ask_source_of_truth") return { text: "Question", cls: "pb" };
  return { text: "Needs review", cls: "pb" };
}

/** Whether the card's main button opens the detail view (to review before approving) instead of acting. */
export const opensDetail = (n: NotificationDTO) => n.type === "new_offer" || n.type === "offer_flagged" || n.type === "usage_ending";
