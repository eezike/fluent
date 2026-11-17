import { handle, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getRow, rowToDTO } from "@/lib/notifications";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return json({ notification: rowToDTO(await getRow(user.id, id)) });
});
