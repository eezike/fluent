import { handle, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const tab = new URL(req.url).searchParams.get("tab") === "done" ? "done" : "active";
  return json(await listNotifications(user.id, tab));
});
