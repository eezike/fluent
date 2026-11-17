import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { suggestForPage } from "@/lib/sync/page";

export const runtime = "nodejs";
export const maxDuration = 60;
export const OPTIONS = options;

export const POST = handle(async (req: Request) => {
  await requireUser(req);
  const b = await req.json();
  if (typeof b?.text !== "string") throw new HttpError(400, "Missing page text");
  return json({ suggestion: await suggestForPage(b) });
});
