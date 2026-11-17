import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { decide } from "@/lib/actions";

export const runtime = "nodejs";
export const OPTIONS = options;

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = await req.json();
  if (body.decision !== "approve" && body.decision !== "reject") throw new HttpError(400, "Invalid decision");
  const edited = body.payload && typeof body.payload === "object"
    ? { to: String(body.payload.to ?? ""), subject: String(body.payload.subject ?? ""), body: String(body.payload.body ?? "") }
    : undefined;
  if (edited && (!edited.to.includes("@") || !edited.subject || !edited.body)) throw new HttpError(400, "To, subject and body are required.");
  const action = await decide(user.id, id, body.decision, edited as any);
  return json({ action });
});
