import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { deleteConnection, getConnection, updateMeta } from "@/lib/connections";

export const runtime = "nodejs";
export const OPTIONS = options;

function sheetId(input: string): string {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(input);
  return (m ? m[1] : input).trim();
}

export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req);
  if (!(await getConnection(user.id, "google"))) throw new HttpError(400, "Connect Google first.");
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (typeof body.rateCardSheetId === "string") patch.rateCardSheetId = sheetId(body.rateCardSheetId);
  if (typeof body.dealsSheetId === "string") patch.dealsSheetId = sheetId(body.dealsSheetId);
  if (typeof body.rateCardRange === "string") patch.rateCardRange = body.rateCardRange.trim() || "A1:H60";
  await updateMeta(user.id, "google", patch);
  return json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  const user = await requireUser(req);
  await deleteConnection(user.id, "google");
  return json({ ok: true });
});
