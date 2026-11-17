import { after } from "next/server";
import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { refine } from "@/lib/refine";
import { getRow } from "@/lib/notifications";
import { recordFeedback } from "@/lib/admin/feedback";

export const runtime = "nodejs";
export const maxDuration = 60;
export const OPTIONS = options;

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { message } = await req.json();
  if (typeof message !== "string" || !message.trim()) throw new HttpError(400, "Say what to change.");
  const row = await getRow(user.id, id);
  const n = await refine(user.id, id, message.trim());
  after(() => recordFeedback(user.id, row, "refined", { message: message.trim() }));
  return json({ notification: n });
});
