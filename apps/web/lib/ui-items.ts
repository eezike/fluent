import type { ModelMessage } from "ai";
import { toolLabel, type UiItem } from "@fluent/shared";

/** Converts stored model messages into what the chat UI renders. */
export function toUiItems(rows: { message: ModelMessage; display: string | null }[]): UiItem[] {
  const items: UiItem[] = [];
  const toolIndex = new Map<string, number>();
  for (const { message, display } of rows) {
    if (message.role === "user") {
      const text =
        display ??
        (typeof message.content === "string"
          ? message.content
          : message.content.map((p) => (p.type === "text" ? p.text : "")).join(""));
      items.push({ kind: "user", text });
    } else if (message.role === "assistant") {
      const parts = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
      for (const p of parts as any[]) {
        if (p.type === "text" && p.text?.trim()) items.push({ kind: "text", text: p.text });
        if (p.type === "tool-call") {
          toolIndex.set(p.toolCallId, items.length);
          items.push({ kind: "tool", id: p.toolCallId, name: p.toolName, label: toolLabel(p.toolName), ok: null });
        }
      }
    } else if (message.role === "tool") {
      for (const p of message.content as any[]) {
        if (p.type !== "tool-result") continue;
        const idx = toolIndex.get(p.toolCallId);
        const out = p.output?.value ?? p.output;
        const failed = out && typeof out === "object" && "error" in out;
        if (idx !== undefined) (items[idx] as Extract<UiItem, { kind: "tool" }>).ok = !failed;
        if (out && typeof out === "object" && "actionId" in out) {
          items.push({ kind: "pending", actionId: String(out.actionId) });
        }
      }
    }
  }
  return items;
}
