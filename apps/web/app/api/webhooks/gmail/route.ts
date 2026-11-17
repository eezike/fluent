import { after } from "next/server";
import { handle, HttpError, json } from "@/lib/http";
import { optionalEnv } from "@/lib/env";
import { admin } from "@/lib/supabase-admin";
import { syncUser } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Pub/Sub push endpoint for Gmail watch. Set the subscription's push URL to
 * https://<app>/api/webhooks/gmail?token=<GMAIL_PUSH_TOKEN>
 */
export const POST = handle(async (req: Request) => {
  const expected = optionalEnv("GMAIL_PUSH_TOKEN");
  if (!expected || new URL(req.url).searchParams.get("token") !== expected) throw new HttpError(401, "Unauthorized");
  const body = await req.json();
  let email = "";
  try {
    email = JSON.parse(Buffer.from(body?.message?.data ?? "", "base64").toString("utf8")).emailAddress ?? "";
  } catch {
    // ignore malformed payloads; Pub/Sub will not retry a 200
  }
  if (email) {
    const { data } = await admin().from("settings").select("user_id").eq("gmail_email", email);
    for (const r of data ?? []) {
      await admin().from("settings").update({ last_push_at: new Date().toISOString() }).eq("user_id", r.user_id);
      after(() => syncUser(r.user_id as string, { minGapMs: 3_000 }));
    }
  }
  return json({ ok: true });
});
