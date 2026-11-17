import { handle, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { googleAuthUrl } from "@/lib/connectors/google";

export const runtime = "nodejs";
export const OPTIONS = options;

/** Returns the Google consent URL. The browser can't send a Bearer header on a redirect, so the client fetches this then navigates. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const returnTo = typeof body.returnTo === "string" && body.returnTo.startsWith("/") ? body.returnTo : "/";
  return json({ url: googleAuthUrl(user.id, returnTo) });
});
