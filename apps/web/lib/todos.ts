import type { TodoDTO } from "@fluent/shared";
import { admin } from "./supabase-admin";
import { HttpError } from "./http";
import { addDays, daysBetween, shortDate } from "./core/rules";

export const toDTO = (r: any): TodoDTO => ({
  id: r.id,
  title: r.title,
  note: r.note ?? undefined,
  dueDate: r.due_date ?? undefined,
  source: r.source,
  status: r.status,
  notificationId: r.notification_id ?? undefined,
  createdAt: r.created_at,
});

export async function listTodos(userId: string) {
  const { data } = await admin().from("todos").select("*").eq("user_id", userId).in("status", ["open", "suggested"]).order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []).map(toDTO);
  const byDue = (a: TodoDTO, b: TodoDTO) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.createdAt.localeCompare(a.createdAt);
  return { open: rows.filter((r) => r.status === "open").sort(byDue), suggested: rows.filter((r) => r.status === "suggested").sort(byDue) };
}

export async function getTodo(userId: string, id: string) {
  const { data } = await admin().from("todos").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "To do not found");
  return data;
}

export async function createTodo(userId: string, input: { title: string; note?: string; dueDate?: string }) {
  const title = (input.title ?? "").trim();
  if (!title) throw new HttpError(400, "Write what needs doing.");
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new HttpError(400, "Due date should look like 2027-03-10.");
  const { data, error } = await admin().from("todos").insert({ user_id: userId, title: title.slice(0, 200), note: input.note?.trim().slice(0, 1000) || null, due_date: input.dueDate || null, source: "user", status: "open" }).select("*").single();
  if (error) throw new Error(error.message);
  return toDTO(data);
}

export type DealForTodo = { id: string; brand: string; status: string; post_start: string | null; payment_due: string | null; paid_at: string | null };
export type Suggestion = { key: string; title: string; note: string; due: string };

/** Things worth putting on the list, from dates already in the user's deals. No model involved. */
export function todoSuggestions(deals: DealForTodo[], today: string): Suggestion[] {
  const out: Suggestion[] = [];
  for (const d of deals) {
    if (d.status === "declined") continue;
    if (d.post_start && d.post_start >= today && d.post_start <= addDays(today, 7)) {
      out.push({ key: `post:${d.id}:${d.post_start}`, title: `Post ${d.brand} content`, note: `Posting window opens ${shortDate(d.post_start)}.`, due: d.post_start });
    }
    if (d.payment_due && !d.paid_at && d.status !== "paid" && d.payment_due >= today && daysBetween(today, d.payment_due) <= 7) {
      out.push({ key: `pay:${d.id}:${d.payment_due}`, title: `Check ${d.brand} payment arrived`, note: `Payment is due ${shortDate(d.payment_due)}.`, due: d.payment_due });
    }
  }
  return out;
}

/** Adds suggestions as "suggested" to dos. A key that already exists (even if dismissed) is never added twice. */
export async function suggestTodos(userId: string, today: string): Promise<number> {
  const { data } = await admin().from("deals").select("id,brand,status,post_start,payment_due,paid_at").eq("user_id", userId).neq("status", "declined");
  const sug = todoSuggestions((data ?? []) as DealForTodo[], today);
  if (!sug.length) return 0;
  const { data: ins, error } = await admin()
    .from("todos")
    .upsert(sug.map((s) => ({ user_id: userId, title: s.title, note: s.note, due_date: s.due, source: "agent", status: "suggested", dedupe_key: s.key })), { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return ins?.length ?? 0;
}
