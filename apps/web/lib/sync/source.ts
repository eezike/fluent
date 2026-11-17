import type { SourceOfTruth } from "@fluent/shared";
import { admin } from "../supabase-admin";
import { getConnection } from "../connections";
import { getSettings, updateSettings } from "../settings";
import { createNotification } from "../notifications";
import { planAskSource, type Sot } from "../core/plan";
import { rowToDeal } from "../core/mapping";
import { listAllRecords } from "../connectors/airtable";
import { readRange } from "../connectors/sheets";

export const DEALS_TAB = "Deals";

export async function sotChoices(userId: string) {
  const [g, a] = await Promise.all([getConnection(userId, "google"), getConnection(userId, "airtable")]);
  const sheetId = (g?.meta.dealsSheetId as string | undefined) || (g?.meta.rateCardSheetId as string | undefined);
  return {
    sheets: g && sheetId ? { sheetId } : null,
    airtable: a && a.meta.baseId && a.meta.table ? { table: a.meta.table as string } : null,
  };
}

/**
 * Which tool holds the user's deal records. If they picked one, use it. If only one is connected, use that.
 * If both are connected and they haven't chosen, ask once (as a notification) and return null for now.
 */
export async function resolveSot(userId: string, opts: { ask: boolean }): Promise<Sot> {
  const s = await getSettings(userId);
  if (s.source_of_truth) return s.source_of_truth;
  const c = await sotChoices(userId);
  if (c.airtable && !c.sheets) return "airtable";
  if (c.sheets && !c.airtable) return "sheets";
  if (c.airtable && c.sheets && opts.ask) {
    await createNotification(userId, "ask_source_of_truth", planAskSource({ airtable: `${c.airtable.table} table`, sheets: `${DEALS_TAB} tab` }));
  }
  return null;
}

export async function chooseSot(userId: string, choice: SourceOfTruth) {
  await updateSettings(userId, { source_of_truth: choice, last_import_at: null });
}

/** Reads the source of truth into the deals table. The SoT always wins over Fluent's cached copy. */
export async function importDeals(userId: string, opts: { force?: boolean } = {}): Promise<number> {
  const s = await getSettings(userId);
  const sot = s.source_of_truth ?? (await resolveSot(userId, { ask: false }));
  if (!sot) return 0;
  if (!opts.force && s.last_import_at && Date.now() - Date.parse(s.last_import_at) < 10 * 60_000) return 0;

  let rows: { key: string; fields: Record<string, unknown> }[] = [];
  if (sot === "airtable") {
    rows = (await listAllRecords(userId)).map((r) => ({ key: `airtable:${r.id}`, fields: r.fields }));
  } else {
    const c = await sotChoices(userId);
    if (!c.sheets) return 0;
    const { values } = await readRange(userId, c.sheets.sheetId, `${DEALS_TAB}!A1:Z400`);
    const [header, ...body] = values;
    if (!header) return 0;
    rows = body.map((r, i) => ({ key: `sheet:${c.sheets!.sheetId}:${i + 2}`, fields: Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])) }));
  }

  const upserts = rows
    .map((r) => ({ key: r.key, deal: rowToDeal(r.fields) }))
    .filter((r): r is { key: string; deal: NonNullable<ReturnType<typeof rowToDeal>> } => !!r.deal)
    .map((r) => ({ user_id: userId, source_key: r.key, ...r.deal, updated_at: new Date().toISOString() }));
  if (upserts.length) {
    const { error } = await admin().from("deals").upsert(upserts, { onConflict: "user_id,source_key" });
    if (error) throw new Error(error.message);
  }
  await updateSettings(userId, { last_import_at: new Date().toISOString() });
  return upserts.length;
}

export async function recentDeals(userId: string) {
  const { data } = await admin().from("deals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  return (data ?? []) as any[];
}
