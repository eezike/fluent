import { after } from "next/server";
import type { TodoAct } from "@fluent/shared";
import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabase-admin";
import { getTodo, toDTO } from "@/lib/todos";
import { runTask, startTask } from "@/lib/ask";

export const runtime = "nodejs";
export const maxDuration = 120;
export const OPTIONS = options;

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { action } = (await req.json()) as TodoAct;
  const row = await getTodo(user.id, id);
  const db = admin();
  const set = async (patch: Record<string, unknown>) => {
    const { data, error } = await db.from("todos").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").single();
    if (error) throw new Error(error.message);
    return toDTO(data);
  };
  switch (action) {
    case "done":
      return json({ todo: await set({ status: "done" }) });
    case "reopen":
      return json({ todo: await set({ status: "open" }) });
    case "dismiss":
      return json({ todo: await set({ status: "dismissed" }) });
    case "accept":
      if (row.status !== "suggested") throw new HttpError(409, "That one isn't a suggestion any more.");
      return json({ todo: await set({ status: "open" }) });
    case "delegate": {
      if (row.notification_id) throw new HttpError(409, "Fluent is already on this.");
      const text = [row.title, row.note].filter(Boolean).join(". ");
      const n = await startTask(user.id, text);
      after(() => runTask(user.id, n.id, text));
      return json({ todo: await set({ status: "open", notification_id: n.id }), notification: n });
    }
    default:
      throw new HttpError(400, "Unknown action");
  }
});
