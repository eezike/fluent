import type { ModelMessage } from "ai";
import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabase-admin";
import { toUiItems } from "@/lib/ui-items";
import { rowToAction } from "@/lib/actions";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const db = admin();
  const { data: conv } = await db.from("conversations").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!conv) throw new HttpError(404, "Conversation not found");
  const { data: rows } = await db.from("messages").select("message, display").eq("conversation_id", id).order("id");
  const { data: actions } = await db.from("pending_actions").select("*").eq("conversation_id", id).eq("user_id", user.id);
  return json({
    items: toUiItems((rows ?? []) as { message: ModelMessage; display: string | null }[]),
    actions: (actions ?? []).map(rowToAction),
  });
});
