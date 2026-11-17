import { handle, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { syncUser } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 120;
export const OPTIONS = options;

/** Called whenever an app opens or regains focus, so new mail shows up without waiting for the cron. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  return json(await syncUser(user.id, { minGapMs: 20_000 }));
});
