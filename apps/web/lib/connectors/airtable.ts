import { getConnection } from "../connections";

const API = "https://api.airtable.com/v0";

async function creds(userId: string) {
  const c = await getConnection(userId, "airtable");
  if (!c) throw new Error("Airtable isn't connected.");
  const baseId = c.meta.baseId as string | undefined;
  const table = c.meta.table as string | undefined;
  if (!baseId || !table) throw new Error("Airtable needs a base ID and table name in Connectors.");
  return { token: c.secret, baseId, table };
}

async function af(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message ?? `Airtable error (${res.status})`);
  return j;
}

export async function getSchema(userId: string) {
  const { token, baseId, table } = await creds(userId);
  try {
    const j = await af(token, `${API}/meta/bases/${baseId}/tables`);
    const t = (j.tables as any[]).find((x) => x.name === table || x.id === table);
    if (t) return { table: t.name, fields: (t.fields as any[]).map((f) => ({ name: f.name, type: f.type, options: f.options?.choices?.map((c: any) => c.name) })) };
  } catch {
    // token may lack schema scope; fall through to sampling records
  }
  const sample = await af(token, `${API}/${baseId}/${encodeURIComponent(table)}?maxRecords=3`);
  const names = new Set<string>();
  for (const r of sample.records as any[]) Object.keys(r.fields).forEach((k) => names.add(k));
  return { table, fields: [...names].map((name) => ({ name, type: "unknown" })), note: "Inferred from sample records" };
}

export async function listDeals(userId: string, opts: { filterByFormula?: string; maxRecords?: number }) {
  const { token, baseId, table } = await creds(userId);
  const params = new URLSearchParams({ maxRecords: String(Math.min(opts.maxRecords ?? 25, 50)) });
  if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula);
  const j = await af(token, `${API}/${baseId}/${encodeURIComponent(table)}?${params}`);
  return (j.records as any[]).map((r) => ({ id: r.id, fields: r.fields }));
}

export async function createDeal(userId: string, fields: Record<string, unknown>) {
  const { token, baseId, table } = await creds(userId);
  const j = await af(token, `${API}/${baseId}/${encodeURIComponent(table)}`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  const r = j.records[0];
  return { id: r.id as string, fields: r.fields };
}

export async function updateDeal(userId: string, recordId: string, fields: Record<string, unknown>) {
  const { token, baseId, table } = await creds(userId);
  const j = await af(token, `${API}/${baseId}/${encodeURIComponent(table)}/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
  return { id: j.id as string, fields: j.fields };
}

export async function verifyAirtable(token: string, baseId: string, table: string) {
  await af(token, `${API}/${baseId}/${encodeURIComponent(table)}?maxRecords=1`);
}

export async function listAllRecords(userId: string, max = 300) {
  const { token, baseId, table } = await creds(userId);
  const out: { id: string; fields: Record<string, unknown> }[] = [];
  let offset: string | undefined;
  while (out.length < max) {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const j = await af(token, `${API}/${baseId}/${encodeURIComponent(table)}?${params}`);
    for (const r of j.records as any[]) out.push({ id: r.id, fields: r.fields });
    offset = j.offset;
    if (!offset) break;
  }
  return out;
}
