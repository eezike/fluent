import { after } from "next/server";
import { handle, HttpError, json, options } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { executeReprocess, startReprocess } from "@/lib/admin/reprocess";
import { admin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 300;
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const { data } = await admin().from("reprocess_jobs").select("*").order("started_at", { ascending: false }).limit(30);
  return json({ jobs: data ?? [] });
});

/** Dry run only: results are stored for review. Nothing about any user's notifications changes. */
export const POST = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const b = await req.json();
  const days = Math.min(Math.max(Math.round(Number(b.days ?? 7)), 1), 90);
  const limit = Math.min(Math.max(Math.round(Number(b.limit ?? 30)), 1), 100);
  const prompt = typeof b.text === "string" && b.text.trim().length >= 40 ? { text: b.text } : { pick: b.pick ?? "default" };
  if (typeof b.text === "string" && b.text.trim() && b.text.trim().length < 40) throw new HttpError(400, "That prompt is too short to be real.");
  const id = await startReprocess({ days, limit, prompt, model: b.model ?? null, by: me.id });
  await audit(me, "reprocess", id, { days, limit, pick: (prompt as any).pick, customText: "text" in prompt, model: b.model });
  after(() => executeReprocess(id));
  return json({ id });
});
