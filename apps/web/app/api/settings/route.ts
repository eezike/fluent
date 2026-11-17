import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { chooseSot, importDeals, sotChoices } from "@/lib/sync/source";

export const runtime = "nodejs";
export const maxDuration = 60;
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const [s, c] = await Promise.all([getSettings(user.id), sotChoices(user.id)]);
  return json({ sourceOfTruth: s.source_of_truth, available: { airtable: !!c.airtable, sheets: !!c.sheets } });
});

export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { sourceOfTruth } = await req.json();
  if (sourceOfTruth !== "airtable" && sourceOfTruth !== "sheets") throw new HttpError(400, "Invalid source of truth");
  await chooseSot(user.id, sourceOfTruth);
  const imported = await importDeals(user.id, { force: true });
  return json({ ok: true, imported });
});
