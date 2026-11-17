import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { refine } from "@/lib/refine";

export const runtime = "nodejs";
export const maxDuration = 60;
export const OPTIONS = options;

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { message } = await req.json();
  if (typeof message !== "string" || !message.trim()) throw new HttpError(400, "Say what to change.");
  return json({ notification: await refine(user.id, id, message.trim()) });
});
